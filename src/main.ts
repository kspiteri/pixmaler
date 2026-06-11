// Pixmaler bootstrap — mount the root Vue component, load global styles.

import { createApp } from "vue";
import App from "./App.vue";
import "./styles/main.scss";

createApp(App).mount("#app");
