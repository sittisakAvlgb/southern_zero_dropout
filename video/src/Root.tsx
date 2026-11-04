import { Composition } from 'remotion'
import { Film } from './Film'
import { FPS, SCORE_SECONDS } from './timeline.mjs'

export const Root = () => (
  <Composition id="PRFilm" component={Film} durationInFrames={Math.round(SCORE_SECONDS * FPS)} fps={FPS} width={1920} height={1080} />
)
