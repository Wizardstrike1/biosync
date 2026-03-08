import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./App.tsx";
import "./index.css";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!clerkPublishableKey) {
	throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY. Add it to your .env file.");
}

createRoot(document.getElementById("root")!).render(
	<ClerkProvider publishableKey={clerkPublishableKey}>
		<App />
	</ClerkProvider>,
);
