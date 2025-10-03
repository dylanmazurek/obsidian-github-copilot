import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import * as path from "path";
import { Notice } from "obsidian";
import { EditorView } from "@codemirror/view";

import CopilotPlugin from "../main";
import { SettingsObserver } from "../settings/CopilotPluginSettingTab";
import AuthModal from "../modal/AuthModal";
import Vault from "../helpers/Vault";
import Logger from "../helpers/Logger";
import { Stream } from "../helpers/LSP";
import Client, { CopilotResponse } from "./Client";
import { GetCompletionsParams } from "@pierrad/ts-lsp-client";
import { InlineSuggestionEffect } from "../extensions/InlineSuggestionState";

class CopilotAgent implements SettingsObserver {
	private plugin: CopilotPlugin;
	private client: Client;
	private agent: ChildProcessWithoutNullStreams;
	private agentPath: string;
	private lspStream: Stream;

	constructor(plugin: CopilotPlugin) {
		this.plugin = plugin;

		this.agentPath = path.join(
			Vault.getCopilotPath(this.plugin.app),
			"dist",
			"language-server.js"
		);

		this.plugin.settingsTab.registerObserver(this);
		this.lspStream = new Stream(this.onMessage.bind(this));
	}

	public getAgent(): ChildProcessWithoutNullStreams {
		return this.agent;
	}

	public getClient(): Client {
		if (!this.client) {
			new Notice("Copilot is not ready yet! Please check your settings.");
		}

		return this.client;
	}

	public async setup(): Promise<void> {
		this.startAgent();
		this.setupListeners();

		await this.configureClient();

		new Notice("Copilot is ready!");
		return Promise.resolve();
	}

	public startAgent(): void {
		try {
			const options = {
				cwd: Vault.getBasePath(this.plugin.app),
				env: process.env
			};

			if (this.plugin.settings.proxy) {
				if (this.plugin.settings.proxy.startsWith("http://")) {
					options.env = { ...options.env, HTTP_PROXY: this.plugin.settings.proxy };
				} else if (this.plugin.settings.proxy.startsWith("https://")) {
					options.env = { ...options.env, HTTPS_PROXY: this.plugin.settings.proxy };
				}
			}

			this.agent = spawn(
				this.plugin.settings.nodePath,
				[this.agentPath, "--stdio"],
				{
					stdio: ["pipe", "pipe", "pipe"],
					...options,
				},
			) as ChildProcessWithoutNullStreams;
		} catch (error) {
			new Notice("Error starting agent: " + error);
		}
	}

	public async configureClient() {
		this.client = new Client(this.plugin);

		await this.client.setup();
	}

	public stopAgent(): Promise<void> {
		return new Promise((resolve) => {
			if (this.client) {
				this.client.dispose();
			}

			if (this.agent && !this.agent.killed) {
				let resolved = false;

				const resolveOnce = () => {
					if (!resolved) {
						resolved = true;
						resolve();
					}
				};

				this.agent.once('exit', resolveOnce);

				this.agent.kill('SIGTERM');

				setTimeout(() => {
					if (this.agent && !this.agent.killed) {
						this.agent.kill('SIGKILL');
					}

					resolveOnce();
				}, 5000);
			} else {
				resolve();
			}
		});
	}

	public setupListeners(): void {
		this.agent.stdout.on("data", (data) => this.onChunk(data));
		this.agent.stderr.on("data", (data) => this.onError(data));
		this.agent.on("exit", (code) => this.onExit(code));
	}

	private onChunk(data: Buffer): void {
		this.lspStream.onChunk(data);
	}

	private onMessage(json: CopilotResponse): void {
		if (json?.result?.status === "NotSignedIn") {
			this.client.initiateSignIn()
				.then((res) => {
					new AuthModal(
						this.plugin,
						res.userCode,
						res.verificationUri,
					).open();
				});
			return;
		}

		if (json?.result?.status === "Error") {
			Logger.getInstance().error(`Error from Copilot: ${json.result.message}`);
			return;
		}

		if (json?.result?.status === "Success") {
			return;
		}

		Logger.getInstance().log(`Received message: ${JSON.stringify(json)}`);
	}

	private onError(data: string): void {
		Logger.getInstance().error(`stderr: ${data}`);
	}

	private onExit(code: number | null): void {
		Logger.getInstance().log(`child process exited with code ${code}`);

		new Notice("Copilot has stopped.");
	}

	public async triggerCompletions(
		view: EditorView,
		params: GetCompletionsParams,
	): Promise<void> {
		this.plugin.statusBar?.updateElement(true);
		const res = await this.client.completion(params);
		this.plugin.statusBar?.updateElement();

		if (res && res.completions && res.completions.length > 0) {
			const completions = res.completions.map((c) => c.displayText);
			view.dispatch({
				effects: [
					InlineSuggestionEffect.of({
						suggestions: completions,
						index: 0,
					}),
				],
			});
		}
	}

	async onSettingsUpdate(): Promise<void> {
		if (await this.plugin.settingsTab.isCopilotEnabledWithPathCheck())
			return this.setup();
		return this.stopAgent();
	}
}

export default CopilotAgent;
