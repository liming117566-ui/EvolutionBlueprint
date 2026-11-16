param([switch]$Force)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies @('System.Drawing.Common','System.Collections.Concurrent','System.Threading.Tasks.Parallel','System.Threading','System.Private.Windows.Core','System.Drawing.Primitives','System.Private.Windows.GdiPlus') -TypeDefinition @'
using System;
using System.IO;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
using System.Collections.Concurrent;
using System.Threading.Tasks;
public static class MaterialImages {
 public static string ConvertAll(string[] files,string output,bool overwrite) {
  int count=0;var errors=new ConcurrentBag<string>();
  Parallel.ForEach(files,new ParallelOptions{MaxDegreeOfParallelism=6},file=>{
   string dest=Path.Combine(output,Path.GetFileNameWithoutExtension(file)+".png");
   if(!overwrite && File.Exists(dest)){System.Threading.Interlocked.Increment(ref count);return;}
   try {
    using(var im=Image.FromFile(file)) {
     double scale=Math.Min(3.0,1400.0/Math.Max(im.Width,im.Height));
     int w=Math.Max(1,(int)Math.Round(im.Width*scale)),h=Math.Max(1,(int)Math.Round(im.Height*scale));
     using(var bmp=new Bitmap(w,h))using(var g=Graphics.FromImage(bmp)) {
      g.Clear(Color.White);g.SmoothingMode=SmoothingMode.HighQuality;g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.DrawImage(im,0,0,w,h);bmp.Save(dest,ImageFormat.Png);
     }
    }
    System.Threading.Interlocked.Increment(ref count);
   }catch(Exception ex){errors.Add(file+": "+ex.Message);}
  });
  return "Converted "+count+"; failures "+errors.Count+"\n"+String.Join("\n",errors);
 }
}
'@
$materialsRoot=Split-Path -Parent $PSScriptRoot
$materialFiles=Get-Content -LiteralPath (Join-Path $materialsRoot 'work/metafiles.json') -Raw | ConvertFrom-Json
[MaterialImages]::ConvertAll([string[]]$materialFiles,(Join-Path $materialsRoot 'web/media'),$Force.IsPresent)

