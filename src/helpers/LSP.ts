import {
	DidChangeTextDocumentParams,
	DidOpenTextDocumentParams,
	GetCompletionsParams,
} from "@pierrad/ts-lsp-client";
import Logger from "./Logger";

class LSP {
	public static createDidOpenParams(args: {
		uri: string;
		version: number;
		text: string;
	}): DidOpenTextDocumentParams {
		return {
			textDocument: {
				uri: "file://" + args.uri,
				languageId: "markdown",
				version: args.version,
				text: args.text,
			},
		};
	}

	public static createDidChangeParams(args: {
		uri: string;
		version: number;
		text: string;
	}): DidChangeTextDocumentParams {
		return {
			textDocument: {
				uri: "file://" + args.uri,
				version: args.version,
			},
			contentChanges: [
				{
					text: args.text,
				},
			],
		};
	}

	public static createCompletionParams(args: {
		uri: string;
		relativePath: string;
		line: number;
		character: number;
		version: number;
		indentSize?: number;
	}): GetCompletionsParams {
		return {
			doc: {
				tabSize: 2,
				indentSize: args.indentSize || 4,
				insertSpaces: false,
				uri: "file://" + args.uri,
				relativePath: args.relativePath,
				position: {
					line: args.line,
					character: args.character,
				},
				version: args.version,
			},
		};
	}
}

class Stream {
	streamBuffer: string;
	nextMessageLength: number | null;
	onMessage: (json: string) => void = (json: string) => { };

	constructor(onMessage: (json: string) => void) {
		this.streamBuffer = "";
		this.nextMessageLength = null;
		this.onMessage = onMessage;
	}

	public onChunk(data: Buffer) {
		var dataString = data.toString();
		const lines = dataString.split('\r\n\r\n');

		for (const line of lines) {
			if (line.trim() === "") {
				continue;
			}

			if (this.nextMessageLength !== null && this.streamBuffer.length >= this.nextMessageLength) {
				this.onFullMessage();
			}

			var isContentLength = this.checkContentLength(line);
			if (isContentLength) {
				continue;
			}

			this.streamBuffer += line;
		}
	}

	public checkContentLength(data: string): boolean {
		const match = data.match(/Content-Length:\s*(\d+)/);
		if (!match) {
			return false;
		}

		const contentLength = parseInt(match[1], 10);
		if (isNaN(contentLength) || contentLength < 0) {
			Logger.getInstance().error(`Invalid Content-Length: ${match[1]}`);

			return false;
		}

		this.nextMessageLength = contentLength;

		return true;
	}

	public onFullMessage(): void {
		if (this.nextMessageLength == null) {
			Logger.getInstance().error("No next message length set, cannot process full message.");
			return;
		}

		var message = this.streamBuffer.slice(0, this.nextMessageLength);

		this.streamBuffer = this.streamBuffer.slice(this.nextMessageLength);
		this.nextMessageLength = null;

		try {
			const json = JSON.parse(message);
			this.onMessage(json);
		} catch (error) {
			Logger.getInstance().error(`Error parsing JSON: ${error}`);
		}
	}
}

export { LSP, Stream };
