import assert from 'node:assert/strict';
import test from 'node:test';
import {GodCameraInput,GOD_INPUT_MAX_GAP_MS} from '../src/scene/godCameraInput.js';

test('an entire short press between rendered frames is consumed once on release',()=>{
  const input=new GodCameraInput();assert.equal(input.edge('KeyD',true,0),undefined);
  assert.deepEqual(input.edge('KeyD',false,800),{seconds:.8,forward:0,right:1,spin:0,sprint:false});
  assert.equal(input.consume(1000),undefined);assert.equal(input.edge('KeyD',false,1100),undefined);
});
test('rendered samples and release partition the same held interval',()=>{
  const input=new GodCameraInput();input.edge('KeyW',true,0);
  const first=input.consume(300)!,last=input.edge('KeyW',false,800)!;
  assert.equal(first.seconds,.3);assert.equal(last.seconds,.5);assert.equal(input.consume(900),undefined);
});
test('Shift edges preserve each speed interval without auto-repeat duplication',()=>{
  const input=new GodCameraInput();input.edge('KeyD',true,0);
  assert.equal(input.edge('KeyD',true,100,true),undefined);
  assert.equal(input.edge('KeyD',true,150),undefined);
  assert.deepEqual(input.edge('ShiftLeft',true,200),{seconds:.2,forward:0,right:1,spin:0,sprint:false});
  const sprint=input.edge('ShiftLeft',false,500)!;assert.equal(sprint.seconds,.3);assert.equal(sprint.sprint,true);
  assert.equal(input.edge('KeyD',false,800)!.seconds,.3);
});
test('opposing movement and spin keys cancel only their shared interval',()=>{
  const input=new GodCameraInput();input.edge('KeyW',true,0);input.edge('KeyS',true,0);
  input.edge('KeyQ',true,0);input.edge('KeyE',true,0);
  assert.equal(input.consume(300),undefined);assert.equal(input.edge('KeyS',false,400),undefined);
  const step=input.consume(500)!;assert.equal(step.forward,1);assert.equal(step.spin,0);assert.equal(step.seconds,.1);
});
for(const at of [-1,NaN,Infinity,50])test(`invalid or reversed time ${at} discards held input`,()=>{
  const input=new GodCameraInput();input.edge('KeyD',true,100);assert.equal(input.consume(at),undefined);
  assert.equal(input.consume(900),undefined);
});
test('a duplicate timestamp never replays a movement',()=>{
  const input=new GodCameraInput();input.edge('KeyD',true,0);assert.equal(input.consume(200)!.seconds,.2);
  assert.equal(input.consume(200),undefined);assert.equal(input.edge('KeyD',false,200),undefined);
});
test('stale gaps and explicit resets discard held input rather than catching up',()=>{
  const input=new GodCameraInput();input.edge('KeyD',true,0);
  assert.equal(input.consume(GOD_INPUT_MAX_GAP_MS+1),undefined);assert.equal(input.consume(GOD_INPUT_MAX_GAP_MS+100),undefined);
  assert.equal(input.edge('KeyD',true,GOD_INPUT_MAX_GAP_MS+200,true),undefined);
  input.edge('KeyD',true,3000);input.reset();assert.equal(input.edge('KeyD',false,3800),undefined);
  input.edge('KeyA',true,4000);assert.equal(input.consume(4100)!.right,-1);
});
test('an invalid key edge cannot arm a later movement',()=>{
  const input=new GodCameraInput();input.edge('KeyD',true,NaN);assert.equal(input.consume(100),undefined);
  input.edge('KeyD',true,500);input.edge('ShiftLeft',true,400);assert.equal(input.consume(600),undefined);
  input.edge('KeyD',true,700);input.edge('KeyD',true,650,true);assert.equal(input.consume(800),undefined);
});
