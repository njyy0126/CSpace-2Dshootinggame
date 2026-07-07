# Browser 2D PvP Shooter

Room-code-based browser PvP shooter built with Phaser 3, Express, and Socket.IO.

## Local development

1. `npm install`
2. `npm run dev`
3. Open `http://localhost:5173`

## Production build

1. `npm run build`
2. `npm run start`

The server serves the built client from the same Node process, with all room and match state kept in memory only.

## Render

- Create a Node web service on the free plan
- Build command: `npm install && npm run build`
- Start command: `npm run start`
- No database is required
- Room state is ephemeral and will reset if the free instance sleeps or restarts
![Uploading image.png…]()
