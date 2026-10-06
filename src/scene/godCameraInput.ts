export type GodCameraInputStep={seconds:number;forward:number;right:number;spin:number;sprint:boolean};
const GOD_KEYS=new Set(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ShiftLeft']);
// A suspended page must not replay an unbounded camera movement on return.
export const GOD_INPUT_MAX_GAP_MS=2000;
export const isGodCameraInputKey=(code:string)=>GOD_KEYS.has(code);

export class GodCameraInput {
  private readonly held=new Set<string>();
  private sampledAt?:number;

  reset(){this.held.clear();this.sampledAt=undefined;}

  consume(at:number):GodCameraInputStep|undefined {
    if(!Number.isFinite(at)||at<0||(this.sampledAt!==undefined&&at<this.sampledAt)){this.reset();return;}
    const elapsed=this.sampledAt===undefined?0:at-this.sampledAt;
    this.sampledAt=at;
    if(elapsed>GOD_INPUT_MAX_GAP_MS){this.held.clear();return;}
    const forward=Number(this.held.has('KeyW'))-Number(this.held.has('KeyS'));
    const right=Number(this.held.has('KeyD'))-Number(this.held.has('KeyA'));
    const spin=Number(this.held.has('KeyQ'))-Number(this.held.has('KeyE'));
    if(elapsed<=0||(!forward&&!right&&!spin))return;
    return {seconds:elapsed/1000,forward,right,spin,sprint:this.held.has('ShiftLeft')};
  }

  edge(code:string,down:boolean,at:number,repeat=false):GodCameraInputStep|undefined {
    if(!GOD_KEYS.has(code))return;
    if(!Number.isFinite(at)||at<0||(this.sampledAt!==undefined&&at<this.sampledAt)){this.reset();return;}
    if(repeat||this.held.has(code)===down)return;
    const step=this.consume(at);
    if(down)this.held.add(code);else this.held.delete(code);
    return step;
  }
}
