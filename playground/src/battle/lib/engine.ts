// 배틀 데모는 문서 사이트와 같이 배포 번들(../dist)을 그대로 쓴다.
// src/engine.ts 와 달리 import 만으로 데이터를 받지 않는다 (테스트·지연 청크에서 필요할 때 preloadData).
export * from '../../../../dist-web/index.js'
