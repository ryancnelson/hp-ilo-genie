#!/usr/bin/env python3
"""Optional loopback-only transport for container VMs without direct LAN access.

This does not terminate TLS, decode the console, or handle credentials.
Run in a terminal with LAN permission; stop with Ctrl-C.
"""
import argparse
import asyncio


async def forward(reader, writer, target, port):
    peer = None
    try:
        remote, peer = await asyncio.wait_for(asyncio.open_connection(target, port), 5)

        async def copy(source, destination):
            while chunk := await source.read(65536):
                destination.write(chunk)
                await destination.drain()

        tasks = [asyncio.create_task(copy(reader, peer)), asyncio.create_task(copy(remote, writer))]
        try:
            await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
    except (OSError, asyncio.TimeoutError) as exc:
        print(f"Connection to {target}:{port} failed: {exc}", flush=True)
    finally:
        writer.close()
        if peer:
            peer.close()


async def main(args):
    servers = []
    for local, remote in [(args.https_listen, args.https_target), (args.console_listen, args.console_target)]:
        server = await asyncio.start_server(
            lambda r, w, port=remote: forward(r, w, args.target, port), '127.0.0.1', local
        )
        servers.append(server)
        print(f"127.0.0.1:{local} → {args.target}:{remote}", flush=True)
    try:
        await asyncio.gather(*(server.serve_forever() for server in servers))
    finally:
        for server in servers:
            server.close()
            await server.wait_closed()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('target')
    parser.add_argument('--https-listen', type=int, default=14443)
    parser.add_argument('--https-target', type=int, default=443)
    parser.add_argument('--console-listen', type=int, default=17991)
    parser.add_argument('--console-target', type=int, default=17990)
    try:
        asyncio.run(main(parser.parse_args()))
    except KeyboardInterrupt:
        pass
