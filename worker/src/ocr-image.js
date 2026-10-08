import {PNG} from 'pngjs';
// Keep the original evidence image. This derived copy improves white digits on Agoda's blue card.
export function darkDigitsOnWhite(bytes){
 const input=PNG.sync.read(bytes),pad=20;
 const output=new PNG({width:input.width+pad*2,height:input.height+pad*2});output.data.fill(255);
 for(let y=0;y<input.height;y++)for(let x=0;x<input.width;x++){
  const i=(y*input.width+x)*4,o=((y+pad)*output.width+x+pad)*4;
  const value=input.data[i]+input.data[i+1]+input.data[i+2]>690?0:255;
  output.data[o]=output.data[o+1]=output.data[o+2]=value;output.data[o+3]=255;
 }
 return PNG.sync.write(output);
}
export function ratingGlyphs(bytes){
 const image=PNG.sync.read(darkDigitsOnWhite(bytes)),seen=new Uint8Array(image.width*image.height),components=[];
 for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
  const start=y*image.width+x;if(seen[start]||image.data[start*4]!==0)continue;
  const queue=[start];seen[start]=1;const c={left:x,right:x,top:y,bottom:y,area:0};
  for(let i=0;i<queue.length;i++){const p=queue[i],px=p%image.width,py=Math.floor(p/image.width);c.area++;c.left=Math.min(c.left,px);c.right=Math.max(c.right,px);c.top=Math.min(c.top,py);c.bottom=Math.max(c.bottom,py);for(const [nx,ny] of [[px-1,py],[px+1,py],[px,py-1],[px,py+1]]){if(nx<0||nx>=image.width||ny<0||ny>=image.height)continue;const n=ny*image.width+nx;if(!seen[n]&&image.data[n*4]===0){seen[n]=1;queue.push(n);}}}
  if(c.area>20&&c.left>20&&c.top>20&&c.right<image.width-21&&c.bottom<image.height-21)components.push(c);
 }
 components.sort((a,b)=>a.left-b.left);
 const tall=components.filter(c=>c.bottom-c.top>=30);if(tall.length<1||tall.length>3)throw new Error('Ambiguous rating image');
 const baseline=Math.max(...tall.map(c=>c.bottom)),height=Math.max(...tall.map(c=>c.bottom-c.top));
 return components.map(c=>{
  if(c.bottom-c.top<height*.4){if(c.top<baseline-height*.3||c.left<=tall[0].right||c.right>=tall.at(-1).left)throw new Error('Unverified decimal mark');return {decimal:true};}
  const glyph=new PNG({width:c.right-c.left+41,height:c.bottom-c.top+41});glyph.data.fill(255);
  for(let y=c.top;y<=c.bottom;y++)for(let x=c.left;x<=c.right;x++){const i=(y*image.width+x)*4,o=((y-c.top+20)*glyph.width+x-c.left+20)*4;glyph.data[o]=glyph.data[o+1]=glyph.data[o+2]=image.data[i];}
  return {bytes:PNG.sync.write(glyph)};
 });
}
