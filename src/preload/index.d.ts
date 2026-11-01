import { CodingAreaAPI } from './index'

declare global {
  interface Window {
    codingArea: CodingAreaAPI
  }
}
