// App entry. Registers scenes, then starts the router.

import { registerScene, start } from "./core.js";
import { hotelScene } from "./scenes/hotel.js";

registerScene(hotelScene);

start();
