import formidable from "formidable";
import fs from "node:fs/promises";
import {fileTypeFromBuffer} from "file-type";
import {preparePdfDocument,extractDocxDocument} from "../_lib/documentExtraction.js";
export const config={api:{bodyParser:false}};
const MAX_FILE=10*1024*1024,MAX_TOTAL=25*1024*1024,MAX_FILES=5;
const send=(res,status,data)=>{res.setHeader("Cache-Control","no-store, private");res.setHeader("X-Content-Type-Options","nosniff");return res.status(status).json(data)};
function parse(req){const form=formidable({multiples:true,maxFiles:MAX_FILES,maxFileSize:MAX_FILE,maxTotalFileSize:MAX_TOTAL,allowEmptyFiles:false,minFileSize:1,keepExtensions:true});return new Promise((resolve,reject)=>form.parse(req,(e,fields,files)=>e?reject(e):resolve(files)))}
export default async function handler(req,res){
 if(req.method!=="POST"){res.setHeader("Allow","POST");return send(res,405,{error:"Use POST to upload documents."})}
 if(!(req.headers["content-type"]||"").toLowerCase().startsWith("multipart/form-data;"))return send(res,415,{error:"Use multipart/form-data."});
 let files;const paths=[],buffers=[];
 try{
  files=await parse(req);const raw=files.documents;const uploads=Array.isArray(raw)?raw:raw?[raw]:[];
  if(!uploads.length)return send(res,400,{error:"Choose at least one PDF or DOCX document."});
  const documents=[];
  for(const file of uploads){
   paths.push(file.filepath);const buffer=await fs.readFile(file.filepath);buffers.push(buffer);
   const type=await fileTypeFromBuffer(buffer),pdf=type?.mime==="application/pdf"&&buffer.subarray(0,5).toString()==="%PDF-",docx=type?.mime==="application/zip"&&buffer.subarray(0,2).toString()==="PK",name=file.originalFilename||"Unnamed file";
   if(!pdf&&!docx){documents.push({name,status:"rejected",error:"File contents do not match a supported PDF or DOCX document."});continue}
   try{const data=pdf?await preparePdfDocument(buffer):await extractDocxDocument(buffer);documents.push({name,type:pdf?"PDF":"DOCX",status:"ready",pageCount:data.pageCount,characterCount:data.text.length,text:data.text,pages:pdf?data.pages:undefined,truncated:data.truncated,readingMethod:data.readingMethod,ocrPages:data.ocrPages||[],warnings:data.warnings||[]})}
   catch(error){documents.push({name,type:pdf?"PDF":"DOCX",status:"failed",error:error.userMessage||error.message||"Document extraction failed."})}
  }
  return send(res,200,{ok:true,documents,limits:{maxFiles:MAX_FILES,maxFileSizeMB:10,maxTotalSizeMB:25},retention:"Temporary processing only; uploaded temporary files are deleted after extraction."});
 }catch(error){const tooLarge=error.httpCode===413||/maxFileSize|maxTotalFileSize|maxFiles|too large/i.test(error.message||"");return send(res,tooLarge?413:400,{error:tooLarge?"Upload limit: 5 files, 10 MB per file and 25 MB combined.":error.message||"Upload could not be processed."})}
 finally{for(const buffer of buffers)buffer.fill(0);for(const path of paths){try{await fs.unlink(path)}catch{/* best-effort cleanup */}}if(files)for(const file of Object.values(files).flat()){if(file?.filepath&&!paths.includes(file.filepath)){try{await fs.unlink(file.filepath)}catch{/* best-effort cleanup */}}}}
}
