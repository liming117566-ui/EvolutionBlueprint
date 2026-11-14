# 管理服务与小程序接口契约

所有 JSON 成功字段直接置于对象中，错误 `{error,code?}`。所有时间为 ISO 字符串或 null。API与上传同源；测试/开发新端口3002，不停止旧3000/3001。用户 Bearer token；管理员 HttpOnly Cookie `blueprint_admin`、写请求 `X-CSRF-Token`，登录前 GET /api/admin/session 获得匿名csrf。`GET /api/admin/session` 返回 `{authenticated,csrf,admin?}`。

## 内容树
`{version,settings,categories,courses}`。settings `{brandName,logo,avatar,gateCover,welcomeTitle,gateTitle,gateDescription,nav:[{id:'home'|'learn'|'profile',label,icon}],help:[],about:[],redeemHelp:[]}`。categories `[{id,title}]`。courses `[{id,categoryId,title,subtitle,description,duration,cover,published:boolean,chapters:[{id,title,legacyIndex?,sections:[{id,title,question,body:[string],practice,legacyIndex?}]}]}]`。
服务端生成初始稳定种子 `server/seed.json`（不要修改）。新内容ID可由前端crypto.randomUUID()生成，整个树ID唯一，排序即数组顺序。正式内容被引用的实体不得跨层级搬移；归档课程用published:false，删除章节/小节不删历史。所有用户文本按纯文本渲染。
资源URL只接受已上传 `/api/assets/{id}` 或保留的本地 `/assets/...`；小程序本地assets可继续使用，服务器为后台预览提供对应assets。文档URLs固定 `/api/materials/{id}/file`。

## 管理 API
- GET /api/admin/session ->上述会话；POST /api/admin/session `{username,password}` -> `{admin,csrf}`；DELETE 同路由退出。
- POST /api/admin/password `{currentPassword,password}` 改密并撤销旧会话。
- GET /api/admin/catalog -> 内容树(version是草稿乐观锁数字)
- PUT /api/admin/catalog `{version,settings,categories,courses}` -> `{version,...}` 保存整个草稿，冲突409。
- POST /api/admin/publish `{version}` -> `{version,publishedAt}` 原子发布；GET /api/admin/published -> 已发布完整树(仅admin)
- POST /api/admin/assets multipart `file`，可附title -> `{asset:{id,title,fileType,sizeBytes,url,kind}}`，kind image/document。图片PNG/JPEG/WebP最大5MiB，文档PDF/DOC/DOCX最大20MiB。
- GET /api/admin/assets?page=1&q= -> `{items,total,page,pageSize}`；GET /api/admin/assets/:id/file admin预览文档；DELETE /api/admin/assets/:id 删除未引用资产。
- GET /api/admin/materials -> `{items:[{id,assetId,title,scope:'course'|'chapter'|'section',ownerId,sortOrder,published}]}`
- POST /api/admin/materials `{assetId,title,scope,ownerId,sortOrder?,published?}`；PUT /api/admin/materials/:id 同字段；DELETE 解除关联；响应`{material}`。资料关联独立管理，published控制可见，但必须归属当前发布内容且有权益；未发布实体不会泄露。
- GET /api/admin/users?page=1&q= ->分页items用户`{id,nickname,note,status:'active'|'disabled',createdAt,lastLoginAt}`
- GET /api/admin/users/:id -> `{user,grants,learning:{sections,positions,legacyChapters}}`
- PATCH /api/admin/users/:id `{nickname?,note?,status?}` -> `{user}`
- POST /api/admin/users/:id/grants `{scope:'all'|'courses',courseIds:[],expiresAt:null|ISO,reason}` -> `{grant}`
- POST /api/admin/grants/:id/revoke `{reason}`
- GET /api/admin/card-batches?page=1&q= ->分页items`{id,title,count,scope,courseIds,redeemExpiresAt,accessDays,disabled,usedCount,createdAt}`
- POST /api/admin/card-batches `{title,count(1..500),scope:'all'|'courses',courseIds:[],redeemExpiresAt:null|ISO,accessDays:null|integer}` -> `{batch,codes:[明文仅此次返回]}`。后台拿到后立即显示可复制和下载txt，关闭后不可恢复。
- POST /api/admin/card-batches/:id/disable ->停用未核销卡；GET /api/admin/cards?batchId=&page=&q=&status= ->分页掩码卡，不能再次取明文。
- GET /api/admin/redemptions?page=1 ->分页兑换记录
- GET /api/admin/audit?page=1 ->分页审计日志

## 小程序 API
- GET /api/bootstrap -> `{version,settings,categories}` 已发布公共展示
- POST /api/auth/wechat `{code}` -> `{token,user}`；无AppSecret明确503，无假装成功。
- POST /api/auth/dev `{deviceId}` ->同上，仅显式DEV_AUTH=1且回环来源、非production可用，模拟器本地验证用；正常小程序不要自动回退到此接口。
- POST /api/auth/logout Bearer撤销当前会话。
- GET /api/me Bearer -> `{user,grants,hasAccess:boolean}`
- GET /api/courses [可选Bearer] -> `{version,courses:[{id,title,subtitle,description,duration,cover,category,categoryId,lessons,accessible}]}` 不含正文。
- GET /api/courses/:id Bearer+权益 -> `{version,course:完整课程(含category),legacyMap:{chapters:[{id,legacyIndex,sections:[{id,legacyIndex}]}]}}`
- POST /api/redeem Bearer `{code}` -> `{ok:true,message,user,grants}`；重试同用户幂等，不同用户409。
- GET /api/materials?scope=course|chapter|section&ownerId= Bearer+权益 ->保留原格式`{materials:[{id,title,fileType,url,sizeBytes}]}`。
- GET /api/materials/:id/file Bearer+权益，继续原生downloadFile/openDocument，不外链不token拼URL。
- GET /api/me/learning -> `{sections:[{sectionId,completed,updatedAt}],positions:[{courseId,chapterId,sectionId,updatedAt}],legacyChapters:[{chapterId}]}`
- PUT /api/me/learning `{courseId,chapterId,sectionId?,completed?:boolean}` -> `{ok:true}`，sectionId存在且completed才标记小节；不带sectionId只记位置。完成是单调幂等。
- POST /api/me/learning/import `{importId,sections:[sectionId],chapters:[chapterId]}` -> `{ok:true}`，只允许固定seed映射及当前授权，不当成付费权益；同用户importId幂等。

小程序保留主题→点目录→小章节UI；后台可改变小章节数量。页面helper要await远程加载，不能依赖静态完整课程。学习缓存按user.id隔离，旧blueprintLearning/blueprintReading保留，用户确认后映射种子ID导入。既有本地seed正文仅用于迁移映射/测试，不作为服务不可达或无授权时的正文回退。
# 学习板块扩展

`GET /api/bootstrap` 新增 `boards` 数组，仅返回已启用板块，不返回课程正文。管理员 `GET/PUT /api/admin/catalog` 的草稿和 `GET /api/admin/published` 的发布快照包含全部板块；沿用原版本冲突校验和原子发布流程。

每个板块包含 `id/title/subtitle/description`、`experience`（courses/english-starry-sky/cn-math-taxonomy/tainai-junior-math）、`group`（subject/growth/life）、`tone`（blue/lilac/ink）、`badge/icon/cover`、`categoryIds`、`enabled/home/learn/featured` 和 `features`。数组顺序就是展示顺序，多个主推荐取首页可见板块中的第一个。图片必须是已有的本地资源或已上传图片引用。三个独立模块分别提供英语星空、数学知识图谱、初中数学分步课程；课程主题和 features 仅影响 courses 类型。

`features` 至少一项、最多三项，`type` 为 courses/practice/progress，每种类型与入口 ID 在板块内唯一；每项可编辑 `title/description/icon`。`categoryIds` 必须引用有效课程主题。功能入口只组织既有能力，不接受任意 URL 或代码。

板块与主题、课程、章节、小节的 ID 不可跨层级复用。未启用板块不会出现在公开 bootstrap；引用的上传图片仅在启用板块发布后公开。课程正文、练习正文、个人记录及下载均保留原权限校验，板块可见不等于获得课程权限。

`GET /api/integrations/math` 返回 `{ready:boolean,basePath:'/math/'}`。`/math/`、`/math/explore/`、`/math/diagnose/`、`/math/children/` 及相关题库、脚本和授权文件为独立公开静态模块；主后台继续使用原 Cookie / CSRF 与内容安全策略。数学数据保存在设备浏览器本地，不与主程序课程授权、账号记录混用。

`GET /api/integrations/junior-math` 返回 `{ready:boolean,basePath:'/junior-math/'}`。`/junior-math/` 为公开静态课程模块，无需独立账号；设备完成记录键沿用 `math-completed-lessons`，不读写主程序账号权益。小程序页面从已发布板块核验类型与 enabled 状态后打开固定同源路径，不接受任意外部 URL。
