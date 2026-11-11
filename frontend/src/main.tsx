import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./live.css";
import "./desktop.css";
import "./compact-desktop.css";

createRoot(document.getElementById("root")!).render(<App />);
