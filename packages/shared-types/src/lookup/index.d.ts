export interface LookupItem {
    value: string;
    label: string;
    disabled?: boolean;
}
export interface DictionaryItem extends LookupItem {
    code: string;
}
export interface TreeNode<TMeta = Record<string, unknown>> {
    id: string;
    label: string;
    children?: TreeNode<TMeta>[];
    meta?: TMeta;
}
//# sourceMappingURL=index.d.ts.map