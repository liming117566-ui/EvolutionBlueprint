import re

def chapter_for(p):
 s=str(p);title=p.name
 m=re.search(r'专题([1-6])\.',title) or re.search(r'第([1-6])章',s)
 if m:return int(m[1])
 if '第3套' in s:
  n=int(re.search(r'第(\d+)讲',title)[1])
  return 1 if n<=4 else 2 if n<=15 else 3 if n<=21 else 4 if n<=27 else 5 if n<=32 else 6
 for pattern,n in [('一元一次方程',5),('立体图形|几何体|展开图',1),('整式|代数式|表达规律',3),('线段|角相关|多边形',4),('数轴|有理数|绝对值|科学记数',2),('数据|统计图|抽样',6)]:
  if re.search(pattern,title):return n
 return 0

def version_for(title):
 for edition in ['教师版','学生版','全解全析','参考答案','考试版A4','解析版','原卷版']:
  if edition in title:return ('教师版' if edition in ['教师版','全解全析','参考答案','解析版'] else '学生版'),edition
 return '学生版','学生版'
