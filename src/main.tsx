import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { SupabaseAuthProvider } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";

const root = createRoot(document.getElementById("root")!);

if (!isSupabaseConfigured) {
	root.render(
		<div className="min-h-screen bg-background text-foreground px-6 py-10">
			<div className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-6">
				<h1 className="text-xl font-semibold">Missing Supabase config</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to
					<code> biosync-health-hub-main/.env</code> and restart the dev server.
				</p>
				<p className="mt-3 text-xs text-muted-foreground">
					Optional next env var: <code>VITE_EYE_TRACKER_WS_URL</code>.
				</p>
			</div>
		</div>,
	);
} else {
	root.render(
		<SupabaseAuthProvider>
			<App />
		</SupabaseAuthProvider>,
	);
}
