declare module 'bwip-js' {
  export interface BWIPOptions {
    bcid: string;
    text: string;
    scale?: number;
    height?: number;
    includetext?: boolean;
    textxalign?: string;
    textyalign?: string;
    textsize?: number;
    textfont?: string;
    textgaps?: number;
    alttext?: string;
    monochrome?: boolean;
    backgroundcolor?: string;
    barcolor?: string;
  }

  export interface BWIPResult {
    width: number;
    height: number;
    data: Uint8Array;
  }

  export function toBuffer(options: BWIPOptions, callback?: (err: Error | null, png: Buffer) => void): Promise<Buffer>;
  export function toCanvas(canvas: HTMLCanvasElement, options: BWIPOptions): void;
  export function toSVG(options: BWIPOptions): string;
  export function render(options: BWIPOptions): BWIPResult;
  
  const bwipjs: {
    toBuffer: typeof toBuffer;
    toCanvas: typeof toCanvas;
    toSVG: typeof toSVG;
    render: typeof render;
  };
  
  export default bwipjs;
}
