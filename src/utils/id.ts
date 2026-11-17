// ─── 이름 → 데이터 ID(slug) 정규화 ───────────────────────────
// "U-turn" → "u-turn", "King's Shield" → "kings-shield", "Mr. Mime" → "mr-mime"
export function toId(name: string): string {
    return name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')   // é → e
        .toLowerCase()
        .replace(/['’.:%]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
}
