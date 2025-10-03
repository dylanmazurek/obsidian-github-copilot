import { App, FileSystemAdapter } from "obsidian";

class Vault {
	public static DEFAULT_TAB_SIZE = 4;

	public static getBasePath(app: App): string {
		let basePath;
		if (app.vault.adapter instanceof FileSystemAdapter) {
			basePath = app.vault.adapter.getBasePath();
		} else {
			throw new Error("Cannot determine base path.");
		}
		return `${basePath}`;
	}

	public static getConfigPath(app: App): string {
		return `${this.getBasePath(app)}/${app.vault.configDir}`;
	}

	public static getPluginPath(app: App): string {
		return `${this.getConfigPath(app)}/plugins/obsidian-github-copilot`;
	}

	public static getCopilotPath(app: App): string {
		return `${this.getPluginPath(app)}/node_modules/@github/copilot-language-server`;
	}

	public static isFileExcluded(filePath: string, exclude: string[]): boolean {
		return exclude.some((path) => filePath.includes(path));
	}

	public static getTabSize(app: App): number {
		return (
			// @ts-expect-error - getConfig is not typed
			(app.vault.getConfig("tabSize") as number) || this.DEFAULT_TAB_SIZE
		);
	}
}

export default Vault;
