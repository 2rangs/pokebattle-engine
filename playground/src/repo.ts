// 저장소 링크 (랜딩의 근거 링크는 모두 main 의 실제 파일·워크플로를 가리킨다)
export const REPO = 'https://github.com/2rangs/pokebattle-engine'
export const blob = (path: string, lines?: [number, number] | null) => `${REPO}/blob/main/${path}${lines ? `#L${lines[0]}-L${lines[1]}` : ''}`
export const tree = (path: string) => `${REPO}/tree/main/${path}`
export const workflow = (file: string) => `${REPO}/actions/workflows/${file}`
