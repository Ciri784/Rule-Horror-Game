// App entry: register every scene from the registry, then start the router.

import { registerScene, start } from "./core.js";
import { scenes } from "./scenes/index.js";

scenes.forEach(registerScene);

start();
