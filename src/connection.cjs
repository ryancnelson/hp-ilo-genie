const {iloRequest} = require('./ilo-http.cjs');
const cfg = require('./config.cjs').config();
const net = require('net');
const {once, EventEmitter} = require('events');
const {negotiateConnection} = require('ilo-protocol/rc/handshake');
const {Telnet} = require('ilo-protocol/rc/telnet');
const {DvcDecoder} = require('ilo-protocol/rc/video');
const {Command,formatCommand,formatKeyboardCommand,formatMouseCommand} = require('ilo-protocol/rc/command');
const {PNG} = require('pngjs');

class ConsoleConnection extends EventEmitter {
  constructor(options={}) { super(); this.options=options; this.sockets=[]; this.width=0; this.height=0; this.frame=null; this.blocks=0; this.dirty=false; }
  async connect() {
    const token=this.options.token;
    if(!/^[a-f0-9]{32}$/i.test(token||''))throw Error('Sign in to iLO to open the console.');
    const info=await iloRequest('/json/rc_info',{token});
    if(!info.enc_key||!info.rc_port)throw Error('iLO did not authorize the console. Check your session and console license.');
    this.name=info.server_name;
    const rcInfo={encKey:info.enc_key,optionalFeatures:new Set((info.optional_features||'').split(';'))};
    const open=async cmd=>{
      if(this.closed)throw Error('Console connection cancelled.');
      const socket=net.connect({host:cfg.connectHost,port:cfg.consolePort||Number(info.rc_port)});this.sockets.push(socket);
      socket.setNoDelay(true);socket.on('error',e=>this.emit('status',e.message));
      socket.setTimeout(15000,()=>socket.destroy(Error('Console connection timed out.')));
      await once(socket,'connect');
      await Promise.race([negotiateConnection(cmd,socket,Buffer.from(token,'hex'),rcInfo,{negotiateBusy:async()=> 'share'}),new Promise((_,r)=>{const t=setTimeout(()=>r(Error('Console handshake timeout')),10000);t.unref();})]);
      socket.setTimeout(0);
      return socket;
    };
    const rc=await open(false);
    const cmd=await open(true);cmd.on('data',()=>{});
    const self=this;
    this.telnet=new class extends Telnet {
      send(data){rc.write(data);}
      receiveDvc(n){self.decoder.process(n);}
    }(Buffer.from(info.enc_key,'hex'));
    this.decoder=new class extends DvcDecoder {
      setVideoDecryption(c){self.emit('debug','Console cipher '+c);self.telnet.setDvcWithEncryption(c);}
      setScreenDimensions(w,h){
        if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>4096||h>4096) throw Error('Unexpected framebuffer dimensions');
        self.width=w;self.height=h;self.frame=Buffer.alloc(w*h*4,255);self.dirty=true;
        self.emit('resize',{width:w,height:h});
      }
      renderBlock(block,x,y,w,h){
        if(!self.frame)return;
        for(let row=0;row<h;row++)for(let col=0;col<w;col++){
          const px=x+col,py=y+row;if(px<0||py<0||px>=self.width||py>=self.height)continue;
          const color=block[row*this.blockWidth+col];const off=(py*self.width+px)*4;
          self.frame[off]=(color>>>16)&255;self.frame[off+1]=(color>>>8)&255;self.frame[off+2]=color&255;self.frame[off+3]=255;
        }
        self.blocks++;self.dirty=true;
      }
      setPowerStatus(on){self.emit('status',on?'Power on':'Power off');}
      setInfo(licensed,flags){self.emit('debug','Console licensed: '+licensed);}
      printString(channel,text){self.emit('status',text);}
      noVideo(){self.emit('status','No video signal');}
      seize(){self.emit('status','Console session taken over');self.close();}
      ping(){self.telnet.sendDvc(formatCommand(Command.ACK));}
      requestResync(){self.telnet.sendDvc(formatCommand(Command.REQUEST_RESYNC));}
      exitDvc(){self.telnet.exitDvc();}
      clearScreen(){if(self.frame){self.frame.fill(0);self.dirty=true;}}
    }();
    rc.on('data',data=>{try{for(const byte of data)this.telnet.receive(byte);}catch(e){this.emit('status','Decoder: '+e.message);this.close();}});
    rc.on('close',()=>this.close());cmd.on('close',()=>this.close());
    this.emit('status','Authenticated to '+this.name+' on '+info.rc_port);
  }
  png(){return this.frame?PNG.sync.write({width:this.width,height:this.height,data:this.frame}):null;}
  refresh(){this.telnet.sendDvc(formatCommand(Command.REQUEST_RESYNC));}
  keyboard(keys){this.telnet.sendDvc(formatKeyboardCommand(keys));}
  mouse(x,y,buttons){this.telnet.sendDvc(formatMouseCommand(x,y,buttons));}
  close(){if(this.closed)return;this.closed=true;for(const socket of this.sockets)socket.destroy();this.sockets=[];this.emit('closed');}
}
module.exports={ConsoleConnection};
