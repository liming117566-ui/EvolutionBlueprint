const learning=require('../../utils/learning');
const catalog=require('../../utils/catalog');
const boards=require('../../utils/boards');
const study=require('../../utils/study-space');
Page({
 data:{courses:[],boards:[],filtered:[],query:'',group:'all',groups:boards.GROUPS,settings:catalog.settings(),loading:true,error:'',mode:'all',unlockedOnly:false,title:'互动学习',caption:'找到感兴趣的方向，在互动中学得更透。'},
 onLoad(options){const mode=['records','unlocked','practice'].includes(options.mode)?options.mode:'all';this.setData({query:typeof options.q==='string'?options.q.slice(0,80):'',mode,title:{records:'最近学习',unlocked:'已解锁课程',practice:'练习自测',all:'互动学习'}[mode],caption:mode==='practice'?'选择课程，使用课堂中的练习与自测入口。':mode==='records'?'每一段走过的路，都可以再次出发。':'找到感兴趣的方向，在互动中学得更透。'});wx.setNavigationBarTitle({title:this.data.title});},
 onShow(){return this.retry();},
 onHide(){this._version=(this._version||0)+1;this.setData({courses:[],boards:[],filtered:[]});},
 onUnload(){this._version=(this._version||0)+1;},
 async retry(){const version=this._version=(this._version||0)+1;this.setData({loading:true,error:'',boards:[],filtered:[]});try{const result=await learning.browse();if(version!==this._version||!result)return;let items=boards.decorate(result.boards,result.courses,'learn');if(this.data.mode==='unlocked')items=items.filter(b=>b.accessible);if(this.data.mode==='records')items=study.summary(result.courses,items).recentBoards;this.setData({courses:result.courses,boards:items,settings:result.settings});this.filter();}catch(error){if(version===this._version)this.setData({error:error.message});}finally{if(version===this._version)this.setData({loading:false});}},
 filter() {
   const { boards: items, group, unlockedOnly, query } = this.data;
   const keyword = query.trim().toLowerCase();
   const filtered = items.filter(board => {
     if (unlockedOnly && board.accessible !== true) return false;
     if (group !== 'all' && board.group !== group) return false;
     return !keyword || [board.title, board.subtitle, board.description].join(' ').toLowerCase().includes(keyword);
   });
   this.setData({ filtered });
 },
 selectAccess(event) {
   this.setData({ unlockedOnly: event.currentTarget.dataset.access === 'unlocked' });
   this.filter();
 },
 search(event){this.setData({query:event.detail.value});this.filter();},
 selectGroup(event){this.setData({group:event.currentTarget.dataset.id});this.filter();},
 clearSearch(){this.setData({query:'',group:'all',unlockedOnly:false});this.filter();},
  resetList(){if(['records','unlocked'].includes(this.data.mode))this.goAll();else this.clearSearch();},
 openBoard(event){const item=this.data.filtered.find(b=>b.id===event.detail.id);if(item)boards.open(item.id,item.experience);},
 goAll(){wx.redirectTo({url:'/pages/interactive/interactive'});}
});
