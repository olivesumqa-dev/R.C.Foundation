import React from "react";
import ReactDOM from "react-dom/client";
import RCFootingCalculator from "./components/rc-footing-calculator";
import "./styles.css";

function App() {
  return <RCFootingCalculator title="RC Footing Calculator" onClose={() => undefined} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
