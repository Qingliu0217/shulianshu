const books=[
{title:"如何阅读一本书",author:"莫提默·J. 艾德勒 / 查尔斯·范多伦",intro:"一部关于主动阅读、分析阅读与主题阅读的方法论经典。",mentions:[
["荷马史诗","荷马","文学","作为经典文学阅读的例子被讨论"],["神曲","但丁","文学","用于说明经典作品的阅读层次"],["物种起源","查尔斯·达尔文","科学","作为科学论说类作品的例子"],["国富论","亚当·斯密","社科","主题阅读与思想史脉络中的代表作"],["君主论","尼科洛·马基雅维利","政治","实用型作品与政治经典的示例"],["理想国","柏拉图","哲学","哲学著作阅读方法中的重要例子"]]},
{title:"人类简史",author:"尤瓦尔·赫拉利",intro:"从认知革命、农业革命到科学革命，重新讲述智人的发展历程。",mentions:[
["物种起源","查尔斯·达尔文","科学","讨论演化论与人类起源时引用"],["枪炮、病菌与钢铁","贾雷德·戴蒙德","历史","与宏观人类史的解释框架相关"],["国富论","亚当·斯密","经济","讨论资本主义信用体系与增长时涉及"],["共产党宣言","马克思 / 恩格斯","政治","讨论现代意识形态与社会秩序时涉及"],["美丽新世界","阿道司·赫胥黎","文学","思考科技、幸福与未来社会时相关"]]},
{title:"月亮与六便士",author:"威廉·萨默塞特·毛姆",intro:"一个人抛下世俗生活、执意追寻艺术理想的故事。",mentions:[
["圣经","多人","宗教","人物语言和道德判断中的文化典故"],["鲁滨逊漂流记","丹尼尔·笛福","文学","孤岛生活与文明处境的联想"],["失乐园","约翰·弥尔顿","文学","西方文学与宗教意象的背景关联"]]},
{title:"百年孤独",author:"加西亚·马尔克斯",intro:"布恩迪亚家族七代人的传奇，以及马孔多百年的兴衰。",mentions:[
["圣经","多人","宗教","创世、洪水与末日意象的重要来源"],["俄狄浦斯王","索福克勒斯","戏剧","命运、预言与家族循环的文学参照"],["堂吉诃德","塞万提斯","文学","拉丁文学传统与叙事想象的源流"]]}
];
const normalize=s=>s.trim().replace(/[《》〈〉\s·・]/g,"").toLowerCase();
const escapeHtml=s=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const douban=(title,author)=>`https://search.douban.com/book/subject_search?search_text=${encodeURIComponent(`${title} ${author}`)}&cat=1001`;
function search(raw){
  const query=raw.trim(),target=normalize(query);
  if(!target)return;
  const book=books.find(b=>normalize(b.title)===target||normalize(b.title).includes(target)||target.includes(normalize(b.title)));
  const results=document.querySelector("#results"),how=document.querySelector("#how");
  results.hidden=false; how.hidden=true;
  if(!book){
    results.innerHTML=`<div class="empty-state"><span class="empty-icon">？</span><div><p class="kicker">暂未收录</p><h2>还没有《${escapeHtml(query)}》的关联索引</h2><p>当前预览版先收录少量示例书目。你可以试试上方推荐书名。</p></div></div>`;
  }else{
    const cards=book.mentions.map((m,i)=>`<article class="book-card"><div class="cover cover-${i%4+1}"><span>${m[2]}</span><strong>${m[0]}</strong><small>${m[1]}</small></div><div class="card-copy"><span class="number">${String(i+1).padStart(2,"0")}</span><h3>《${m[0]}》</h3><p class="author">${m[1]}</p><p class="note">${m[3]}</p><a href="${douban(m[0],m[1])}" target="_blank" rel="noreferrer">在豆瓣图书中查看 <span aria-hidden="true">↗</span></a></div></article>`).join("");
    results.innerHTML=`<div class="result-heading"><div><p class="kicker">检索结果</p><h2>《${book.title}》里的书</h2><p>${book.author} · ${book.intro}</p></div><div class="count"><strong>${book.mentions.length}</strong><span>本关联作品</span></div></div><div class="book-grid">${cards}</div><p class="source-note">结果来自当前人工校验索引；豆瓣按钮会打开对应书名与作者的图书搜索页。</p>`;
  }
  results.scrollIntoView({behavior:"smooth",block:"start"});
}
document.querySelector("#search-form").addEventListener("submit",e=>{e.preventDefault();search(document.querySelector("#book-search").value)});
document.querySelectorAll("[data-example]").forEach(btn=>btn.addEventListener("click",()=>{document.querySelector("#book-search").value=btn.dataset.example;search(btn.dataset.example)}));
