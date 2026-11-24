/** 제목 글자 → 문서 안 앵커 id (한글 그대로) */
export const sectionId = (text: string) =>
  'sec-' + text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
