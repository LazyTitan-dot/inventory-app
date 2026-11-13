import {mkdir,copyFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {build} from 'vite';
import path from 'node:path';
const dest=path.resolve('public/assets/customer-paddle-v4');
await mkdir(dest,{recursive:true});
const base='https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0';
for(const [name,sha] of Object.entries({'PP-OCRv5_mobile_det':'781056046c9ed77a15c94681605db6a0f62317c2e9cce6931c71da2478d4bc30','latin_PP-OCRv5_mobile_rec':'0fd8634124d871d25492311da077517ba3b4277ea67a0dec9e46ce537978c7cb'})){
 const f=path.join(dest,name+'.tar');let ok=false;try{ok=createHash('sha256').update(await readFile(f)).digest('hex')===sha;}catch{}
 if(!ok){try{execFileSync('curl',['-fL','--max-time','45','https://dgii-poc-isolated-20261112.vercel.app/benchmark/assets/'+name+'.tar','-o',f],{stdio:'inherit'});}catch{execFileSync('curl',['-fL','--retry','2','--max-time','180',base+'/'+name+'_onnx_infer.tar','-o',f],{stdio:'inherit'});}if(createHash('sha256').update(await readFile(f)).digest('hex')!==sha)throw Error('OCR model hash mismatch');}
}
for(const name of ['ort-wasm-simd-threaded.jsep.mjs','ort-wasm-simd-threaded.jsep.wasm','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'])await copyFile('node_modules/onnxruntime-web/dist/'+name,path.join(dest,name));
await copyFile('node_modules/zxing-wasm/dist/reader/zxing_reader.wasm',path.join(dest,'zxing_reader.wasm'));
await build({configFile:false,root:path.resolve('customer-paddle'),base:'/assets/customer-paddle-v4/',publicDir:false,build:{outDir:dest,emptyOutDir:false,target:'es2022',assetsDir:'chunks'}});
