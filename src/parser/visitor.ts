import { AST, ASTType } from "./ast.js";

class Visitor {
	private cb: (node: AST) => void;
	private preventWalkingOn: ASTType[];

	constructor(private ast: AST[]) {}

	public visit(cb: (node: AST) => void, preventWalkingOn: ASTType[] = []) {
		this.cb = cb;
		this.preventWalkingOn = preventWalkingOn;
		this.ast.forEach(node => this.visitNode(node));
	}

	private visitNode(node: AST) {
		if (this.preventWalkingOn.includes(node.type)) return;
		this.cb(node);

		for (const key in node) {
			const value = node[key];
			this.maybeVisitUnknown(value);
		}
	}

	private maybeVisitUnknown(node: any) {
		if (typeof node != "object" || !node) return;
		if (Array.isArray(node)) {
			node.forEach(k => this.maybeVisitUnknown(k));
			return;
		}

		if (!("type" in node)) return;

		const t = node.type as ASTType;
		const typeStr = ASTType[t];
		if (!typeStr) return;

		this.visitNode(node);
	}
}

export { Visitor };
