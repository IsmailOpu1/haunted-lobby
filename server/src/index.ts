import { createGameServer } from "./app.ts";

const port = Number(process.env.PORT ?? 2567);

const server = createGameServer();
await server.listen(port);
console.log(`Haunted Lobby server listening on port ${port}`);
