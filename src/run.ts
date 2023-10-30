import { TCEmulator } from "./assembler/emulator.js";

const emulator = new TCEmulator("../out.tca");
emulator.run();
