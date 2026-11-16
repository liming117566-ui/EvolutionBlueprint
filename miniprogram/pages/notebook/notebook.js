const learning=require('../../utils/learning');const study=require('../../utils/study-space');
Page({
 data:{mode:'notes',draft:'',notes:[],goal:15,checked:false,choices:[10,15,30]},
 onLoad(options){this.setData({mode:options.mode==='plan'?'plan':'notes'});wx.setNavigationBarTitle({title:this.data.mode==='plan'?'学习计划':'学习笔记'});},
 onShow(){if(!learning.authorized())return;this.setData({notes:study.summary().notes,goal:study.read().goal,checked:study.summary().checked});},
 onHide(){this.setData({notes:[],draft:''});},
 input(event){this.setData({draft:event.detail.value});},
 saveNote(){if(!learning.authorized())return;if(!study.addNote(this.data.draft)){wx.showToast({title:'先写下一点学习收获吧',icon:'none'});return;}this.setData({draft:'',notes:study.summary().notes});wx.showToast({title:'笔记已保存',icon:'success'});},
 setGoal(event){if(!learning.authorized())return;const goal=Number(event.currentTarget.dataset.goal);if(![10,15,30].includes(goal))return;study.write({goal});this.setData({goal});wx.showToast({title:'每日目标已更新',icon:'none'});},
 checkin(){if(!learning.authorized())return;study.checkin();this.setData({checked:true});wx.showToast({title:'今日打卡成功',icon:'success'});},
 goCourses(){wx.navigateTo({url:'/pages/interactive/interactive'});}
});
