// App entry. Registers scenes, then starts the router.

import { registerScene, start } from "./core.js";
import { hotel } from "./scenes/hotel.js";

registerScene(hotel);

start();
