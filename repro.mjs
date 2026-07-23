import React from 'react'
import fs from 'fs'
import { renderToBuffer, Document, Page, View, Image as PdfImage, StyleSheet } from '@react-pdf/renderer'
const RED = 'data:image/jpeg;base64,'+fs.readFileSync('/tmp/r.jpg').toString('base64')
const BLU = 'data:image/jpeg;base64,'+fs.readFileSync('/tmp/b.jpg').toString('base64')
const CRS = StyleSheet.create({ page:{ padding:40, paddingBottom:60 } })

async function build(styleFn, name){
  const photosOk=[{path:'a',base64:RED},{path:'b',base64:BLU}]
  const chunk=photosOk.slice(0,2)
  const page=React.createElement(Page,{size:'A4',style:CRS.page},
    React.createElement(View,{style:{flexDirection:'column',flex:1,justifyContent:'space-between',paddingBottom:40}},
      ...chunk.map(ph=>styleFn(ph))))
  const buf=await renderToBuffer(React.createElement(Document,null,page))
  fs.writeFileSync('/tmp/'+name+'.pdf',buf)
  // render to png to inspect visually via pdftoppm later
  const s=buf.toString('latin1'); const imgs=(s.match(/\/Subtype\s*\/Image/g)||[]).length
  console.log(name,'imageXObjects:',imgs,'bytes',buf.length)
}
// current (buggy) layout
await build(ph=>React.createElement(View,{key:ph.path,style:{flex:1,marginVertical:4}},
  React.createElement(PdfImage,{src:ph.base64,style:{width:'100%',height:'100%',objectFit:'contain'}})),'current')
// proposed fix: bounded height, no percentage height
await build(ph=>React.createElement(View,{key:ph.path,style:{flex:1,marginVertical:4,alignItems:'center',justifyContent:'center'}},
  React.createElement(PdfImage,{src:ph.base64,style:{maxWidth:'100%',maxHeight:340,objectFit:'contain'}})),'fixed')
