import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider, theme, App as AntApp } from "antd";
import App from "./App";
import "./styles.css";
// Seed tokens flow through AntD's dark algorithm, keeping inputs, modals and tables consistent.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#8B5CF6",
          colorBgBase: "#0D0B18",
          colorBgContainer: "#191426",
          colorBorder: "#3B2D6B",
          borderRadius: 10,
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          fontSize: 14,
          controlHeight: 40,
        },
        components: {
          Table: { headerBg: "#171322", rowHoverBg: "#211b32" },
          Modal: { contentBg: "#191426", headerBg: "#191426" },
        },
      }}
    >
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
