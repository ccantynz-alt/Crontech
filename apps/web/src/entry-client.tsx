// @refresh reload
import { StartClient, mount } from "@solidjs/start/client";

const appEl = document.getElementById("app");
if (appEl) mount(() => <StartClient />, appEl);
