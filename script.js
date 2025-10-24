// 初始化 LeanCloud
AV.init({
    appId: 'uDt9DqRSqHrU1BF8NpzmOjWx-gzGzoHsz',
    appKey: 'PihmZu3p47nt4KBxRVCaZT68',
    serverURL: 'https://udt9dqrs.lc-cn-n1-shared.com'
});

// 用户管理
let currentUser = null;

// 学生分享数据模型
const StudentSharing = AV.Object.extend('StudentSharing');

// 新的 LeanCloud（教师私密评论用，独立于现有 AV）
const NEW_LC = {
  appId: '805UY3GvZ3cJWtIj0K9cLmhW-gzGzoHsz',
  appKey: 'As6WTVpbs4pumSZqDEcfzS8j',
  server: 'https://805uy3gv.lc-cn-n1-shared.com/1.1',
  sessionToken: null,
  user: null,
  teacherId: null
};

async function lcRequest(endpoint, { method = 'GET', body = null, headers = {} } = {}) {
  const reqHeaders = {
    'X-LC-Id': NEW_LC.appId,
    'X-LC-Key': NEW_LC.appKey,
    'Content-Type': 'application/json',
    ...headers
  };
  if (NEW_LC.sessionToken) {
    reqHeaders['X-LC-Session'] = NEW_LC.sessionToken;
  }
  const res = await fetch(`${NEW_LC.server}${endpoint}`, {
    method,
    headers: reqHeaders,
    body: body ? JSON.stringify(body) : null
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data && (data.error || data.message) ? (data.error || data.message) : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

async function lcLoginOrSignup(username, password) {
  try {
    // LeanCloud REST 登录推荐使用 GET /login?username=&password=
    const qs = `?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    const user = await lcRequest(`/login${qs}`, { method: 'GET' });
    NEW_LC.user = user;
    NEW_LC.sessionToken = user.sessionToken;
    return user;
  } catch (e) {
    // 若登录失败则尝试注册
    const user = await lcRequest('/users', { method: 'POST', body: { username, password } });
    NEW_LC.user = user;
    NEW_LC.sessionToken = user.sessionToken;
    return user;
  }
}

async function ensureTeacherUser() {
  // 获取或创建 teacher 用户，保存其 objectId
  if (NEW_LC.teacherId) return NEW_LC.teacherId;
  try {
    const qs = `?username=${encodeURIComponent('teacher')}&password=${encodeURIComponent('123456')}`;
    const teacher = await lcRequest(`/login${qs}`, { method: 'GET' });
    NEW_LC.teacherId = teacher.objectId;
    return NEW_LC.teacherId;
  } catch (e) {
    const teacher = await lcRequest('/users', { method: 'POST', body: { username: 'teacher', password: '123456' } });
    NEW_LC.teacherId = teacher.objectId;
    return NEW_LC.teacherId;
  }
}

async function getStudentObjectId(studentName, passwordHintMap = {}) {
  // 尝试查询 _User；若不可查询，则用已知密码登录/注册获取 objectId
  try {
    const where = encodeURIComponent(JSON.stringify({ username: studentName }));
    const res = await lcRequest(`/classes/_User?where=${where}`, { method: 'GET' });
    if (res && Array.isArray(res.results) && res.results[0]) {
      return res.results[0].objectId;
    }
  } catch (e) {
    // 忽略查询错误，继续尝试登录/注册
  }
  const pwd = passwordHintMap[studentName] || '123456';
  try {
    const u = await lcRequest('/login', { method: 'POST', body: { username: studentName, password: pwd } });
    return u.objectId;
  } catch (e2) {
    const u = await lcRequest('/users', { method: 'POST', body: { username: studentName, password: pwd } });
    return u.objectId;
  }
}

// 初始化LeanCloud数据表
async function initializeLeanCloudTables() {
    try {
        // 尝试创建一个测试记录来确保表存在
        const testRating = new (AV.Object.extend('ObjectiveRating'))();
        testRating.set('test', true);
        testRating.set('studentId', 'test');
        testRating.set('objectiveId', 'test');
        testRating.set('rating', 1);
        await testRating.save();
        
        // 删除测试记录
        await testRating.destroy();
        
        console.log('ObjectiveRating表已初始化');
    } catch (error) {
        console.log('ObjectiveRating表初始化失败，将在首次使用时自动创建');
    }
    
    try {
        // 尝试创建一个测试记录来确保表存在
        const testSharing = new StudentSharing();
        testSharing.set('test', true);
        testSharing.set('author', 'test');
        testSharing.set('content', 'test');
        testSharing.set('unit', 'test');
        await testSharing.save();
        
        // 删除测试记录
        await testSharing.destroy();
        
        console.log('StudentSharing表已初始化');
    } catch (error) {
        console.log('StudentSharing表初始化失败，将在首次使用时自动创建');
    }
}

// 从课程 JSON 渲染页面
async function renderCurriculumFromJSON() {
    try {
        const response = await fetch('scope-sequence-2025-G7-V3.json');
        if (!response.ok) throw new Error('无法加载课程数据');
        const data = await response.json();

        const units = Array.isArray(data.units) ? data.units : [];
        const grade7 = document.getElementById('grade-7');
        if (!grade7) return;

        // 重置并渲染标题
        grade7.innerHTML = '';
        const title = document.createElement('h2');
        title.textContent = 'Grade 7 Curriculum';
        grade7.appendChild(title);

        // 仅渲染 subject 为 math 的单元（保持原有顺序）
        units.filter(u => u && u.subject === 'math').forEach(unit => {
            const unitDiv = document.createElement('div');
            unitDiv.className = 'unit';

            const unitHeader = document.createElement('h3');
            unitHeader.className = 'unit-title collapsible';
            unitHeader.innerHTML = `📖 ${unit.title} <span class="toggle-icon">▼</span>`;

            const lessonsWrap = document.createElement('div');
            lessonsWrap.className = 'lessons collapsible-content';

            // 依据单元的周数生成对应课时数量
            const objectives = Array.isArray(unit.objectives) ? unit.objectives : [];
            const lessonCount = Math.max(1, Number.isFinite(unit.duration) ? unit.duration : 1);
            const chunkSize = Math.ceil(objectives.length / lessonCount) || 0;

            for (let i = 0; i < lessonCount; i++) {
                const lessonCard = document.createElement('div');
                lessonCard.className = 'lesson-card';

                const lessonTitle = document.createElement('h4');
                lessonTitle.className = 'lesson-title collapsible';
                lessonTitle.innerHTML = `Lesson ${i + 1} <span class="toggle-icon">▼</span>`;

                const lessonSummary = document.createElement('div');
                lessonSummary.className = 'lesson-summary collapsible-content';

                const descP = document.createElement('p');
                descP.innerHTML = `<strong>Summary:</strong> ${unit.description || ''}`;

                const objectivesTitle = document.createElement('p');
                objectivesTitle.innerHTML = '<strong>Learning Objectives:</strong>';

                const ul = document.createElement('ul');
                ul.className = 'objectives-list';

                const start = i * chunkSize;
                const end = chunkSize > 0 ? Math.min(start + chunkSize, objectives.length) : 0;
                const slice = chunkSize > 0 ? objectives.slice(start, end) : [];

                slice.forEach(obj => {
                    const li = document.createElement('li');
                    li.className = 'objective-item';
                    li.setAttribute('data-objective', obj.id);

                    const textSpan = document.createElement('span');
                    textSpan.className = 'objective-text';
                    const chinese = obj.chinese || '';
                    const english = obj.english ? ` (${obj.english})` : '';
                    textSpan.textContent = `${chinese}${english}`;

                    const starDiv = document.createElement('div');
                    starDiv.className = 'star-rating';
                    for (let r = 1; r <= 3; r++) {
                        const star = document.createElement('span');
                        star.className = 'star';
                        star.setAttribute('data-rating', String(r));
                        star.textContent = '★';
                        starDiv.appendChild(star);
                    }
                    const label = document.createElement('span');
                    label.className = 'rating-label';
                    label.textContent = '未评分';
                    starDiv.appendChild(label);

                    li.appendChild(textSpan);
                    li.appendChild(starDiv);
                    ul.appendChild(li);
                });

                const saveBtn = document.createElement('button');
                saveBtn.className = 'save-ratings-btn';
                saveBtn.setAttribute('data-lesson', `${unit.id}-lesson-${i + 1}`);
                saveBtn.textContent = '保存评分';

                const successDiv = document.createElement('div');
                successDiv.className = 'rating-success';
                successDiv.textContent = '评分已保存！';

                lessonSummary.appendChild(descP);
                lessonSummary.appendChild(objectivesTitle);
                lessonSummary.appendChild(ul);
                lessonSummary.appendChild(saveBtn);
                lessonSummary.appendChild(successDiv);

                lessonCard.appendChild(lessonTitle);
                lessonCard.appendChild(lessonSummary);
                lessonsWrap.appendChild(lessonCard);
            }

            // 追加教师私密评论区（按单元），与学生交流分享板块统一样式
            const privateSection = document.createElement('div');
            privateSection.className = 'student-sharing-section teacher-private-section';
            const unitIdentifier = unit.id || unit.title || 'unit';
            const titleId = `private-title-${unitIdentifier}`;
            privateSection.setAttribute('data-unit', unitIdentifier);
            privateSection.innerHTML = `
              <div class="sharing-header">
                <h4 class="sharing-title" id="${titleId}">👩‍🏫 教师留言板块 <span class="privacy-badge" aria-label="仅教师与该学生可见"></span></h4>
                <button class="collapse-btn" title="折叠/展开评论区" aria-expanded="true">
                  <span class="collapse-icon">▼</span>
                </button>
              </div>
              <div class="sharing-content teacher-private" role="region" aria-labelledby="${titleId}" aria-hidden="false">
                <p class="sharing-description">这是一对一的交流，仅你与教师可见。</p>
                <div class="teacher-private-controls" style="margin-bottom:8px;">
                  <label style="display:${(currentUser === 'teacher') ? 'inline-block' : 'none'}; margin-right:8px;">选择学生：</label>
                  <select class="teacher-student-select" aria-label="选择学生" style="display:${(currentUser === 'teacher') ? 'inline-block' : 'none'};"></select>
                </div>
                <div class="sharing-form">
                  <textarea class="sharing-textarea" aria-label="留言输入" rows="3" placeholder="在此与教师交流，仅你与教师可见"></textarea>
                  <div class="sharing-actions">
                    <button class="submit-sharing-btn" aria-label="发送留言">📝 发送</button>
                  </div>
                </div>
                <div class="shared-content">
                  <h5 class="shared-title">对话</h5>
                  <div class="shared-messages teacher-comments-list" aria-live="polite"></div>
                </div>
              </div>
            `;
            lessonsWrap.appendChild(privateSection);

            unitDiv.appendChild(unitHeader);
            unitDiv.appendChild(lessonsWrap);
            grade7.appendChild(unitDiv);
        });

        // 渲染后初始化交互
        // 复用现有函数（已在 DOMContentLoaded 内定义）
        // 这些函数在同一作用域内可见
        const reinit = () => {
            // 重新初始化折叠与高度、星级与搜索
            if (typeof initializeCollapsible === 'function') initializeCollapsible();
            if (typeof setInitialHeights === 'function') setInitialHeights();
            if (typeof initializeStarRating === 'function') initializeStarRating();
            if (typeof addExpandCollapseAllButtons === 'function') addExpandCollapseAllButtons();
            if (typeof addLoadingEffect === 'function') addLoadingEffect();
        };
        // 延迟以确保节点插入完成
        setTimeout(reinit, 50);

    } catch (e) {
        console.error('渲染课程失败：', e);
    }
}

// 登录功能
function initLogin() {
    const loginModal = document.getElementById('loginModal');
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');
    const mainContent = document.getElementById('mainContent');
    const currentUserSpan = document.getElementById('currentUser');
    const logoutBtn = document.getElementById('logoutBtn');

    // 检查是否已登录
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = savedUser;
        // 尝试连接新的 LeanCloud（用于教师私密评论），以防刷新后 NEW_LC 为空
        const map = getValidUsersMap();
        const pwd = map[savedUser] || '123456';
        lcLoginOrSignup(savedUser, pwd)
          .then(() => ensureTeacherUser())
          .then(() => showMainContent())
          .catch(err => {
            console.warn('刷新后评论服务登录失败：', err && err.message ? err.message : err);
            showMainContent();
          });
    }

    // 登录表单提交
    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        // 定义有效的用户账户
        const validUsers = {
            'user': '123456',
            'user1': '123456',
            'test':'123456',
            'user2': '123456',
            'teacher': '123456',
            'Kitty': '20121220',
            'Serena': '20111208',
            'Jessica': '20130825',
            'Celeste': '20120913',
            'Valentina': '20120913',
            'Roxy': '20130117',
            'Mark': '20120512',
            'Cindy': '20130608',
            'Alice': '20120131',
            'Nolan': '20130130',
            'Raye': '20130828',
            'Tanya': '20130706',
            'Yiyi': '20121101',
            'Rockey': '20121108',
            'Terrence': '20120419',
            'Steven': '20130521',
            'Austin': '20130304',
            'TJ': '20130117',
            'Chris': '20121225',
            'Jason': '20121126',
            'Abby': '20120601'
        };
        
        // 验证用户名和密码
        if (validUsers[username] && validUsers[username] === password) {
            currentUser = username;
            localStorage.setItem('currentUser', username);
            // 登录新的 LeanCloud（用于教师私密评论），不影响现有 AV
            lcLoginOrSignup(username, password)
              .then(() => ensureTeacherUser())
              .then(() => showMainContent())
              .catch(err => {
                console.warn('评论登录初始化失败：', err && err.message ? err.message : err);
                showMainContent();
              });
            loginError.style.display = 'none';
        } else {
            loginError.style.display = 'block';
        }
    });

    // 退出登录
    logoutBtn.addEventListener('click', function() {
        currentUser = null;
        localStorage.removeItem('currentUser');
        showLoginModal();
    });

    async function showMainContent() {
        loginModal.style.display = 'none';
        mainContent.style.display = 'block';
        currentUserSpan.textContent = currentUser;
        // 初始化LeanCloud数据表
        await initializeLeanCloudTables();
        // 先渲染课程，再加载评分数据
        await renderCurriculumFromJSON();
        loadUserRatings();
        // 初始化教师私密评论区（静态与动态单元）
        initializeTeacherPrivateSections();
    }

    function showLoginModal() {
        loginModal.style.display = 'flex';
        mainContent.style.display = 'none';
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
        loginError.style.display = 'none';
    }
}

// 加载用户的历史评分数据
async function loadUserRatings() {
    if (!currentUser) return;
    
    try {
        // 查询当前用户的所有评分记录
        const query = new AV.Query('ObjectiveRating');
        query.equalTo('studentId', currentUser);
        const ratings = await query.find();
        
        // 遍历所有评分记录，更新UI显示
        ratings.forEach(rating => {
            const objectiveId = rating.get('objectiveId');
            const ratingValue = rating.get('rating');
            
            // 找到对应的目标元素
            const objectiveItem = document.querySelector(`[data-objective="${objectiveId}"]`);
            if (objectiveItem) {
                // 更新星级显示
                const starRating = objectiveItem.querySelector('.star-rating');
                const stars = starRating.querySelectorAll('.star');
                const ratingLabel = starRating.querySelector('.rating-label');
                
                // 设置星级状态
                stars.forEach((star, index) => {
                    if (index < ratingValue) {
                        star.classList.add('active');
                    } else {
                        star.classList.remove('active');
                    }
                });
                
                // 更新评分标签
                const ratingTexts = ['', '基础', '良好', '优秀'];
                ratingLabel.textContent = ratingTexts[ratingValue];
                
                // 设置data-rating属性
                objectiveItem.setAttribute('data-rating', ratingValue);
                
                // 显示保存按钮（现在应该显示为"更新评分"）
                const lessonSummary = objectiveItem.closest('.lesson-summary');
                const saveBtn = lessonSummary.querySelector('.save-ratings-btn');
                if (saveBtn) {
                    saveBtn.classList.add('show');
                    saveBtn.textContent = '更新评分';
                }
            }
        });
        
        console.log(`已加载 ${ratings.length} 条评分记录`);
        
    } catch (error) {
        console.error('加载评分数据失败:', error);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // 初始化登录功能
    initLogin();
    
    // Get all grade buttons and content sections
    const gradeButtons = document.querySelectorAll('.grade-btn');
    const gradeContents = document.querySelectorAll('.grade-content');
    
    // Add click event listeners to grade buttons
    gradeButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetGrade = this.getAttribute('data-grade');
            
            // Remove active class from all buttons and content
            gradeButtons.forEach(btn => btn.classList.remove('active'));
            gradeContents.forEach(content => content.classList.remove('active'));
            
            // Add active class to clicked button
            this.classList.add('active');
            
            // Show corresponding grade content
            const targetContent = document.getElementById(`grade-${targetGrade}`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });
    
    // Add smooth scrolling for better user experience
    function smoothScrollToTop() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }
    
    // Add click event to grade buttons for smooth scrolling
    gradeButtons.forEach(button => {
        button.addEventListener('click', smoothScrollToTop);
    });
    
    // Add hover effects for lesson cards
    const lessonCards = document.querySelectorAll('.lesson-card');
    
    lessonCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateX(5px) scale(1.02)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateX(0) scale(1)';
        });
    });
    
    // Add collapsible functionality for units and lessons
    function initializeCollapsible() {
        const collapsibleElements = document.querySelectorAll('.collapsible');
        
        collapsibleElements.forEach(element => {
            element.addEventListener('click', function() {
                const content = this.nextElementSibling;
                const icon = this.querySelector('.toggle-icon');
                
                if (content && content.classList.contains('collapsible-content')) {
                    content.classList.toggle('collapsed');
                    icon.classList.toggle('rotated');
                    
                    // Add smooth animation
                    if (content.classList.contains('collapsed')) {
                        content.style.maxHeight = '0';
                        content.style.padding = '0';
                    } else {
                        // Remove maxHeight temporarily to get accurate scrollHeight
                        content.style.maxHeight = 'none';
                        content.style.padding = '';
                        // Force reflow to ensure accurate measurement
                        content.offsetHeight;
                        // Use a more generous height calculation for dynamic content
                        const calculatedHeight = Math.max(content.scrollHeight, content.offsetHeight) + 100;
                        content.style.maxHeight = calculatedHeight + 'px';
                    }
                }
            });
        });
    }
    // 暴露为全局，便于动态渲染后复用
    window.initializeCollapsible = initializeCollapsible;
    
    // Initialize collapsible functionality
    initializeCollapsible();
    
    // Set initial heights for all collapsible content
    function setInitialHeights() {
        const contents = document.querySelectorAll('.collapsible-content');
        contents.forEach(content => {
            if (!content.classList.contains('collapsed')) {
                content.style.maxHeight = 'none';
                content.offsetHeight; // Force reflow
                const calculatedHeight = Math.max(content.scrollHeight, content.offsetHeight) + 100;
                content.style.maxHeight = calculatedHeight + 'px';
            }
        });
    }
    // 暴露为全局
    window.setInitialHeights = setInitialHeights;
    
    // Set initial heights
    setInitialHeights();
    
    // Function to recalculate heights for expanded content
    function recalculateHeights() {
        const expandedContents = document.querySelectorAll('.collapsible-content:not(.collapsed)');
        expandedContents.forEach(content => {
            content.style.maxHeight = 'none';
            content.offsetHeight; // Force reflow
            const calculatedHeight = Math.max(content.scrollHeight, content.offsetHeight) + 100;
            content.style.maxHeight = calculatedHeight + 'px';
        });
    }
    
    // Add mutation observer to watch for content changes
    const observer = new MutationObserver(function(mutations) {
        let shouldRecalculate = false;
        mutations.forEach(function(mutation) {
            if (mutation.type === 'childList' || mutation.type === 'attributes') {
                shouldRecalculate = true;
            }
        });
        if (shouldRecalculate) {
            setTimeout(recalculateHeights, 100); // Delay to ensure DOM updates are complete
        }
    });
    
    // Observe changes in lesson summaries (where star ratings are)
    document.querySelectorAll('.lesson-summary').forEach(summary => {
        observer.observe(summary, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style']
        });
    });
    
    // Add expand/collapse all functionality
    function addExpandCollapseAllButtons() {
        const gradeContents = document.querySelectorAll('.grade-content');
        
        gradeContents.forEach(gradeContent => {
            const controlsDiv = document.createElement('div');
            controlsDiv.className = 'collapse-controls';
            controlsDiv.style.cssText = `
                text-align: center;
                margin-bottom: 1.5rem;
                gap: 1rem;
                display: flex;
                justify-content: center;
            `;
            
            const expandAllBtn = document.createElement('button');
            expandAllBtn.textContent = 'Expand All';
            expandAllBtn.className = 'control-btn';
            expandAllBtn.style.cssText = `
                padding: 8px 16px;
                border: 2px solid #667eea;
                background: white;
                color: #667eea;
                border-radius: 20px;
                cursor: pointer;
                font-size: 0.9rem;
                transition: all 0.3s ease;
            `;
            
            const collapseAllBtn = document.createElement('button');
            collapseAllBtn.textContent = 'Collapse All';
            collapseAllBtn.className = 'control-btn';
            collapseAllBtn.style.cssText = expandAllBtn.style.cssText;
            
            // Add hover effects
            [expandAllBtn, collapseAllBtn].forEach(btn => {
                btn.addEventListener('mouseenter', function() {
                    this.style.background = '#667eea';
                    this.style.color = 'white';
                });
                btn.addEventListener('mouseleave', function() {
                    this.style.background = 'white';
                    this.style.color = '#667eea';
                });
            });
            
            expandAllBtn.addEventListener('click', function() {
                const contents = gradeContent.querySelectorAll('.collapsible-content');
                const icons = gradeContent.querySelectorAll('.toggle-icon');
                
                contents.forEach(content => {
                    content.classList.remove('collapsed');
                    // Remove maxHeight temporarily to get accurate scrollHeight
                    content.style.maxHeight = 'none';
                    content.style.padding = '';
                    // Force reflow to ensure accurate measurement
                    content.offsetHeight;
                    // Use a more generous height calculation for dynamic content
                    const calculatedHeight = Math.max(content.scrollHeight, content.offsetHeight) + 100;
                    content.style.maxHeight = calculatedHeight + 'px';
                });
                
                icons.forEach(icon => {
                    icon.classList.remove('rotated');
                });
            });
            
            collapseAllBtn.addEventListener('click', function() {
                const contents = gradeContent.querySelectorAll('.collapsible-content');
                const icons = gradeContent.querySelectorAll('.toggle-icon');
                
                contents.forEach(content => {
                    content.classList.add('collapsed');
                    content.style.maxHeight = '0';
                    content.style.padding = '0';
                });
                
                icons.forEach(icon => {
                    icon.classList.add('rotated');
                });
            });
            
            controlsDiv.appendChild(expandAllBtn);
            controlsDiv.appendChild(collapseAllBtn);
            
            const firstUnit = gradeContent.querySelector('.unit');
            if (firstUnit) {
                gradeContent.insertBefore(controlsDiv, firstUnit);
            }
        });
    }
    // 暴露为全局
    window.addExpandCollapseAllButtons = addExpandCollapseAllButtons;
    
    // Add expand/collapse all buttons
    addExpandCollapseAllButtons();
    
    // Add loading animation effect
    function addLoadingEffect() {
        const units = document.querySelectorAll('.unit');
        
        units.forEach((unit, index) => {
            unit.style.opacity = '0';
            unit.style.transform = 'translateY(30px)';
            
            setTimeout(() => {
                unit.style.transition = 'all 0.6s ease';
                unit.style.opacity = '1';
                unit.style.transform = 'translateY(0)';
            }, index * 200);
        });
    }
    // 暴露为全局
    window.addLoadingEffect = addLoadingEffect;
    
    // Initialize loading effect
    addLoadingEffect();

    // 星级评分功能
    function initializeStarRating() {
        const stars = document.querySelectorAll('.star');
        const saveButtons = document.querySelectorAll('.save-ratings-btn');
        
        // 为每个星星添加点击事件
        stars.forEach(star => {
            star.addEventListener('click', function() {
                const rating = parseInt(this.getAttribute('data-rating'));
                const objectiveItem = this.closest('.objective-item');
                const starRating = this.closest('.star-rating');
                const ratingLabel = starRating.querySelector('.rating-label');
                const allStars = starRating.querySelectorAll('.star');
                const saveBtn = objectiveItem.closest('.lesson-summary').querySelector('.save-ratings-btn');
                
                // 更新星星状态
                allStars.forEach((s, index) => {
                    if (index < rating) {
                        s.classList.add('active');
                    } else {
                        s.classList.remove('active');
                    }
                });
                
                // 更新评分标签
                const ratingTexts = ['', '基础', '良好', '优秀'];
                ratingLabel.textContent = ratingTexts[rating];
                
                // 存储评分到元素的data属性
                objectiveItem.setAttribute('data-rating', rating);
                
                // 显示保存按钮
                if (saveBtn) {
                    saveBtn.classList.add('show');
                    // 重新计算容器高度以适应新显示的按钮
                    setTimeout(() => {
                        const collapsibleContent = this.closest('.collapsible-content');
                        if (collapsibleContent && !collapsibleContent.classList.contains('collapsed')) {
                            collapsibleContent.style.maxHeight = 'none';
                            collapsibleContent.offsetHeight;
                            const calculatedHeight = Math.max(collapsibleContent.scrollHeight, collapsibleContent.offsetHeight) + 100;
                            collapsibleContent.style.maxHeight = calculatedHeight + 'px';
                        }
                    }, 50);
                }
            });
            
            // 添加悬停效果
            star.addEventListener('mouseenter', function() {
                const rating = parseInt(this.getAttribute('data-rating'));
                const starRating = this.closest('.star-rating');
                const allStars = starRating.querySelectorAll('.star');
                
                allStars.forEach((s, index) => {
                    if (index < rating) {
                        s.style.color = '#ffd700';
                    } else {
                        s.style.color = '#ddd';
                    }
                });
            });
            
            star.addEventListener('mouseleave', function() {
                const starRating = this.closest('.star-rating');
                const allStars = starRating.querySelectorAll('.star');
                
                // 恢复到实际评分状态
                allStars.forEach(s => {
                    if (s.classList.contains('active')) {
                        s.style.color = '#ffd700';
                    } else {
                        s.style.color = '#ddd';
                    }
                });
            });
        });
        
        // 为保存按钮添加点击事件
        saveButtons.forEach(button => {
            button.addEventListener('click', async function() {
                const lessonName = this.getAttribute('data-lesson');
                const lessonSummary = this.closest('.lesson-summary');
                const objectiveItems = lessonSummary.querySelectorAll('.objective-item');
                const successMessage = lessonSummary.querySelector('.rating-success');
                
                // 收集所有评分数据
                const ratings = [];
                objectiveItems.forEach(item => {
                    const objectiveId = item.getAttribute('data-objective');
                    const rating = item.getAttribute('data-rating');
                    const objectiveText = item.querySelector('.objective-text').textContent;
                    
                    if (rating) {
                        ratings.push({
                            objectiveId: objectiveId,
                            objectiveText: objectiveText,
                            rating: parseInt(rating),
                            lessonName: lessonName
                        });
                    }
                });
                
                if (ratings.length === 0) {
                    alert('请至少为一个学习目标评分');
                    return;
                }
                
                // 禁用按钮
                this.disabled = true;
                this.textContent = '保存中...';
                
                try {
                    // 保存到LeanCloud
                    const ObjectiveRating = AV.Object.extend('ObjectiveRating');
                    
                    for (const rating of ratings) {
                        try {
                            // 查询是否已存在相同学生和目标的记录
                            const query = new AV.Query('ObjectiveRating');
                            query.equalTo('studentId', currentUser || 'anonymous');
                            query.equalTo('objectiveId', rating.objectiveId);
                            
                            const existingRating = await query.first();
                            
                            if (existingRating) {
                                // 如果存在，更新现有记录
                                existingRating.set('lessonName', rating.lessonName);
                                existingRating.set('objectiveText', rating.objectiveText);
                                existingRating.set('rating', rating.rating);
                                existingRating.set('updateTime', new Date());
                                await existingRating.save();
                            } else {
                                // 如果不存在，创建新记录
                                const ratingObj = new ObjectiveRating();
                                await ratingObj.save({
                                    lessonName: rating.lessonName,
                                    objectiveText: rating.objectiveText,
                                    rating: rating.rating,
                                    studentId: currentUser || 'anonymous',
                                    objectiveId: rating.objectiveId,
                                    updateTime: new Date()
                                });
                            }
                        } catch (ratingError) {
                            console.error('保存单个评分失败:', ratingError);
                            // 如果是表不存在的错误，尝试重新初始化
                            if (ratingError.message && ratingError.message.includes('doesn\'t exists')) {
                                console.log('尝试重新初始化数据表...');
                                await initializeLeanCloudTables();
                                // 重试保存
                                const ratingObj = new ObjectiveRating();
                                await ratingObj.save({
                                    lessonName: rating.lessonName,
                                    objectiveText: rating.objectiveText,
                                    rating: rating.rating,
                                    studentId: currentUser || 'anonymous',
                                    objectiveId: rating.objectiveId,
                                    updateTime: new Date()
                                });
                            } else {
                                throw ratingError;
                            }
                        }
                    }
                    
                    // 显示成功消息
                    successMessage.style.display = 'block';
                    // 保持按钮显示，以便用户可以再次更新评分
                    this.textContent = '更新评分';
                    
                    // 重新计算容器高度以适应成功消息
                    setTimeout(() => {
                        const collapsibleContent = lessonSummary.closest('.collapsible-content');
                        if (collapsibleContent && !collapsibleContent.classList.contains('collapsed')) {
                            collapsibleContent.style.maxHeight = 'none';
                            collapsibleContent.offsetHeight;
                            const calculatedHeight = Math.max(collapsibleContent.scrollHeight, collapsibleContent.offsetHeight) + 100;
                            collapsibleContent.style.maxHeight = calculatedHeight + 'px';
                        }
                    }, 50);
                    
                    // 3秒后隐藏成功消息，但保持按钮显示
                    setTimeout(() => {
                        successMessage.style.display = 'none';
                        // 隐藏成功消息后重新计算高度
                        setTimeout(() => {
                            const collapsibleContent = lessonSummary.closest('.collapsible-content');
                            if (collapsibleContent && !collapsibleContent.classList.contains('collapsed')) {
                                collapsibleContent.style.maxHeight = 'none';
                                collapsibleContent.offsetHeight;
                                const calculatedHeight = Math.max(collapsibleContent.scrollHeight, collapsibleContent.offsetHeight) + 100;
                                collapsibleContent.style.maxHeight = calculatedHeight + 'px';
                            }
                        }, 50);
                    }, 3000);
                    
                } catch (error) {
                    console.error('保存评分失败:', error);
                    alert('保存失败：' + (error.message || '请稍后重试'));
                } finally {
                    // 恢复按钮
                    this.disabled = false;
                    this.textContent = '保存评分';
                }
            });
        });
    }
    // 暴露为全局
    window.initializeStarRating = initializeStarRating;
    
    // 初始化星级评分功能
    initializeStarRating();
    
    // 初始化学生交流分享功能
    initializeStudentSharing();
    
    // 初始化第二单元学生交流分享功能
    initializeStudentSharing2();
    
    // 初始化评论区折叠功能
    initializeSharingCollapse();
    
    // 初始化第二单元评论区折叠功能
    initializeSharingCollapse2();
    
    // 初始化数学问题区域的折叠功能
    initializeMathProblemCollapsible();

    // 教师私密评论区的初始化改为登录成功后触发，
    // 避免在未登录或用户未确定前绑定导致首次加载失败。
    // 由 showMainContent() 在登录完成后统一调用。
});

// 学生交流分享功能
function initializeStudentSharing() {
    const sharingInput = document.getElementById('sharingInput');
    const submitBtn = document.getElementById('submitSharing');
    const clearBtn = document.getElementById('clearSharing');
    const sharedMessages = document.getElementById('sharedMessages');
    
    if (!sharingInput || !submitBtn || !clearBtn || !sharedMessages) {
        return; // 如果元素不存在，直接返回
    }
    
    // 从LeanCloud加载已分享的消息
    loadSharedMessages();
    
    // 提交分享
    submitBtn.addEventListener('click', async function() {
        const content = sharingInput.value.trim();
        if (!content) {
            alert('请输入要分享的内容！');
            return;
        }
        
        if (content.length > 500) {
            alert('分享内容不能超过500字符！');
            return;
        }
        
        // 禁用按钮防止重复提交
        submitBtn.disabled = true;
        submitBtn.textContent = '分享中...';
        
        try {
            // 保存到LeanCloud
            await saveMessageToCloud(content);
            
            // 清空输入框
            sharingInput.value = '';
            
            // 显示成功提示
            showSuccessMessage('分享成功！');
            
            // 重新加载消息列表
            await loadSharedMessages();
            
        } catch (error) {
            console.error('分享失败:', error);
            // 如果是表不存在的错误，尝试重新初始化
            if (error.message && error.message.includes('doesn\'t exists')) {
                console.log('尝试重新初始化数据表...');
                await initializeLeanCloudTables();
                // 重试保存
                try {
                    await saveMessageToCloud(content);
                    sharingInput.value = '';
                    showSuccessMessage('分享成功！');
                    await loadSharedMessages();
                } catch (retryError) {
                    console.error('重试分享失败:', retryError);
                    alert('分享失败，请稍后重试！');
                }
            } else {
                alert('分享失败，请稍后重试！');
            }
        } finally {
            // 恢复按钮状态
            submitBtn.disabled = false;
            submitBtn.textContent = '📝 分享';
        }
    });
    
    // 清空输入框
    clearBtn.addEventListener('click', function() {
        if (sharingInput.value.trim()) {
            if (confirm('确定要清空输入的内容吗？')) {
                sharingInput.value = '';
            }
        }
    });
    
    // 字符计数提示
    sharingInput.addEventListener('input', function() {
        const length = this.value.length;
        if (length > 450) {
            this.style.borderColor = '#f59e0b';
        } else if (length > 500) {
            this.style.borderColor = '#ef4444';
        } else {
            this.style.borderColor = '#d1d5db';
        }
    });
}

// 链接自动转换
function linkify(text) {
    const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    return text.replace(urlRegex, function(url) {
        return '<a href="' + url + '" target="_blank">' + url + '</a>';
    });
}

// 添加消息到显示区域
function addMessageToDisplay(message, isPinned = false) {
    const sharedMessages = document.getElementById('sharedMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'shared-message';
    if (isPinned) {
        messageDiv.classList.add('pinned-message');
    }
    messageDiv.setAttribute('data-message-id', message.id);
    
    // 检查是否是当前用户的消息，如果是则显示删除按钮
    const isCurrentUserMessage = currentUser && message.author === currentUser;
    const deleteButtonHtml = isCurrentUserMessage ? 
        `<button class="delete-btn" onclick="confirmDeleteMessage2('${message.id}')" title="删除这条评论">×</button>` : '';
    
    // 创建消息头部
    const messageHeader = document.createElement('div');
    messageHeader.className = 'message-header';
    
    const authorSpan = document.createElement('span');
    authorSpan.className = 'message-author';
    authorSpan.textContent = message.author; // 直接使用textContent避免编码问题
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    timeSpan.textContent = message.time;
    
    messageHeader.appendChild(authorSpan);
    messageHeader.appendChild(timeSpan);
    
    // 如果有删除按钮，添加到头部
    if (deleteButtonHtml) {
        messageHeader.insertAdjacentHTML('beforeend', deleteButtonHtml);
    }
    
    // 创建消息内容
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    messageContent.innerHTML = linkify(escapeHtml(message.content));
    
    // 组装消息
    messageDiv.appendChild(messageHeader);
    messageDiv.appendChild(messageContent);
    
    // 插入到示例消息之后
    const sampleMessage = sharedMessages.querySelector('.sample-message');
    if (isPinned) {
        sharedMessages.insertBefore(messageDiv, sampleMessage.nextSibling);
    } else {
        sharedMessages.appendChild(messageDiv);
    }
    
    // 滚动到新消息
    messageDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// 保存消息到LeanCloud
async function saveMessageToCloud(content) {
    try {
        const sharing = new StudentSharing();
        sharing.set('author', currentUser || '匿名同学');
        sharing.set('content', content);
        sharing.set('unit', 'Unit 1'); // 可以根据当前单元动态设置
        
        await sharing.save();
        return sharing;
    } catch (error) {
        console.error('保存到LeanCloud失败:', error);
        throw error;
    }
}

// 从LeanCloud加载消息
async function loadSharedMessages() {
    try {
        // 清空现有消息（保留示例消息）
        const sharedMessages = document.getElementById('sharedMessages');
        const sampleMessage = sharedMessages.querySelector('.sample-message');
        const existingMessages = sharedMessages.querySelectorAll('.shared-message:not(.sample-message)');
        existingMessages.forEach(msg => msg.remove());
        
        // 查询LeanCloud中的分享消息
        const query = new AV.Query('StudentSharing');
        query.equalTo('unit', 'Unit 1'); // 只加载当前单元的消息
        query.descending('createdAt'); // 按创建时间降序排列
        query.limit(50); // 限制最多50条
        
        const results = await query.find();
        
        // 显示消息
        results.forEach(sharing => {
            const message = {
                id: sharing.id,
                author: sharing.get('author') || '匿名用户',
                content: sharing.get('content') || '',
                time: sharing.createdAt.toLocaleString('zh-CN', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                })
            };
            
            // 确保字符串数据正确处理
            if (typeof message.author === 'string' && typeof message.content === 'string') {
                const isPinned = message.author === 'user';
                addMessageToDisplay(message, isPinned);
            }
        });
        
    } catch (error) {
        console.error('从LeanCloud加载消息失败:', error);
        // 如果云端加载失败，尝试加载本地备份
        loadLocalBackupMessages();
    }
}

// 加载本地备份消息（作为云端失败时的备选方案）
function loadLocalBackupMessages() {
    try {
        const messages = JSON.parse(localStorage.getItem('sharedMessages') || '[]');
        messages.forEach(message => {
            addMessageToDisplay(message);
        });
    } catch (error) {
        console.error('加载本地备份消息失败:', error);
    }
}

// HTML转义函数 - 改进版本，更好地处理中文字符
function escapeHtml(text) {
    if (!text) return '';
    
    // 使用更安全的方式处理HTML转义，避免中文字符编码问题
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// 显示成功消息
function showSuccessMessage(text) {
    const message = document.createElement('div');
    message.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #10b981;
        color: white;
        padding: 0.75rem 1rem;
        border-radius: 6px;
        font-size: 0.9rem;
        z-index: 1000;
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    `;
    message.textContent = text;
    document.body.appendChild(message);
    
    setTimeout(() => {
        message.remove();
    }, 3000);
}

// 确认删除消息
function confirmDeleteMessage(messageId) {
    if (confirm('确定要删除这条评论吗？删除后无法恢复。')) {
        deleteMessage(messageId);
    }
}

// 删除消息函数
async function deleteMessage(messageId) {
    try {
        // 从LeanCloud删除消息
        const query = new AV.Query('StudentSharing');
        const sharing = await query.get(messageId);
        
        // 验证是否是当前用户的消息
        if (sharing.get('author') !== currentUser) {
            alert('您只能删除自己的评论！');
            return;
        }
        
        await sharing.destroy();
        
        // 从页面移除消息元素
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            messageElement.remove();
        }
        
        showSuccessMessage('评论已删除');
        
    } catch (error) {
         console.error('删除消息失败:', error);
         alert('删除失败，请稍后重试');
     }
 }

// 初始化评论区折叠功能
function initializeSharingCollapse() {
    const collapseBtn = document.getElementById('collapseSharing');
    const sharingContent = document.getElementById('sharingContent');
    
    if (!collapseBtn || !sharingContent) {
        console.warn('折叠按钮或内容区域未找到');
        return;
    }
    
    // 从本地存储读取折叠状态
    const isCollapsed = localStorage.getItem('sharingCollapsed') === 'true';
    
    // 设置初始状态
    if (isCollapsed) {
        sharingContent.classList.add('collapsed');
        collapseBtn.classList.add('collapsed');
    }
    
    // 添加点击事件监听器
    collapseBtn.addEventListener('click', function() {
        const isCurrentlyCollapsed = sharingContent.classList.contains('collapsed');
        
        if (isCurrentlyCollapsed) {
            // 展开
            sharingContent.classList.remove('collapsed');
            collapseBtn.classList.remove('collapsed');
            localStorage.setItem('sharingCollapsed', 'false');
        } else {
            // 折叠
            sharingContent.classList.add('collapsed');
            collapseBtn.classList.add('collapsed');
            localStorage.setItem('sharingCollapsed', 'true');
        }
    });
}

// 初始化数学问题区域的折叠功能
function initializeMathProblemCollapsible() {
    const problemTitle = document.querySelector('.problem-title');
    
    if (problemTitle) {
        problemTitle.addEventListener('click', function() {
            const content = this.nextElementSibling;
            const icon = this.querySelector('.toggle-icon');
            
            if (this.classList.contains('collapsed')) {
                this.classList.remove('collapsed');
                content.classList.remove('collapsed');
                icon.textContent = '▼';
            } else {
                this.classList.add('collapsed');
                content.classList.add('collapsed');
                icon.textContent = '▶';
            }
        });
    }
}

// 第二单元学生交流分享功能
function initializeStudentSharing2() {
    const sharingInput = document.getElementById('sharingInput2');
    const submitBtn = document.getElementById('submitSharing2');
    const clearBtn = document.getElementById('clearSharing2');
    const sharedMessages = document.getElementById('sharedMessages2');
    
    if (!sharingInput || !submitBtn || !clearBtn || !sharedMessages) {
        return; // 如果元素不存在，直接返回
    }
    
    // 从LeanCloud加载已分享的消息
    loadSharedMessages2();
    
    // 提交分享
    submitBtn.addEventListener('click', async function() {
        const content = sharingInput.value.trim();
        if (!content) {
            alert('请输入要分享的内容！');
            return;
        }
        
        if (content.length > 500) {
            alert('分享内容不能超过500字符！');
            return;
        }
        
        // 禁用按钮防止重复提交
        submitBtn.disabled = true;
        submitBtn.textContent = '分享中...';
        
        try {
            // 保存到LeanCloud
            await saveMessageToCloud2(content);
            
            // 清空输入框
            sharingInput.value = '';
            
            // 显示成功提示
            showSuccessMessage('分享成功！');
            
            // 重新加载消息列表
            await loadSharedMessages2();
            
        } catch (error) {
            console.error('分享失败:', error);
            // 如果是表不存在的错误，尝试重新初始化
            if (error.message && error.message.includes('doesn\'t exists')) {
                console.log('尝试重新初始化数据表...');
                await initializeLeanCloudTables();
                // 重试保存
                try {
                    await saveMessageToCloud2(content);
                    sharingInput.value = '';
                    showSuccessMessage('分享成功！');
                    await loadSharedMessages2();
                } catch (retryError) {
                    console.error('重试分享失败:', retryError);
                    alert('分享失败，请稍后重试！');
                }
            } else {
                alert('分享失败，请稍后重试！');
            }
        } finally {
            // 恢复按钮状态
            submitBtn.disabled = false;
            submitBtn.textContent = '📝 分享';
        }
    });
    
    // 清空输入框
    clearBtn.addEventListener('click', function() {
        if (sharingInput.value.trim()) {
            if (confirm('确定要清空输入的内容吗？')) {
                sharingInput.value = '';
            }
        }
    });
    
    // 字符计数提示
    sharingInput.addEventListener('input', function() {
        const length = this.value.length;
        if (length > 450) {
            this.style.borderColor = '#f59e0b';
        } else if (length > 500) {
            this.style.borderColor = '#ef4444';
        } else {
            this.style.borderColor = '#d1d5db';
        }
    });
}

// 添加消息到第二单元显示区域
function addMessageToDisplay2(message, isPinned = false) {
    const sharedMessages = document.getElementById('sharedMessages2');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'shared-message';
    if (isPinned) {
        messageDiv.classList.add('pinned-message');
    }
    messageDiv.setAttribute('data-message-id', message.id);
    
    // 检查是否是当前用户的消息，如果是则显示删除按钮
    const isCurrentUserMessage = currentUser && message.author === currentUser;
    const deleteButtonHtml = isCurrentUserMessage ? 
        `<button class="delete-btn" onclick="confirmDeleteMessage2('${message.id}')" title="删除这条评论">×</button>` : '';
    
    // 创建消息头部
    const messageHeader = document.createElement('div');
    messageHeader.className = 'message-header';
    
    const authorSpan = document.createElement('span');
    authorSpan.className = 'message-author';
    authorSpan.textContent = message.author; // 直接使用textContent避免编码问题
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    timeSpan.textContent = message.time;
    
    messageHeader.appendChild(authorSpan);
    messageHeader.appendChild(timeSpan);
    
    // 如果有删除按钮，添加到头部
    if (deleteButtonHtml) {
        messageHeader.insertAdjacentHTML('beforeend', deleteButtonHtml);
    }
    
    // 创建消息内容
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    messageContent.innerHTML = linkify(escapeHtml(message.content));
    
    // 组装消息
    messageDiv.appendChild(messageHeader);
    messageDiv.appendChild(messageContent);
    
    // 插入到示例消息之后
    const sampleMessage = sharedMessages.querySelector('.sample-message');
    if (isPinned) {
        sharedMessages.insertBefore(messageDiv, sampleMessage.nextSibling);
    } else {
        sharedMessages.appendChild(messageDiv);
    }
    
    // 滚动到新消息
    messageDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// 保存消息到LeanCloud（第二单元）
async function saveMessageToCloud2(content) {
    try {
        const sharing = new StudentSharing();
        sharing.set('author', currentUser || '匿名同学');
        sharing.set('content', content);
        sharing.set('unit', 'Unit 2'); // 第二单元
        
        await sharing.save();
        return sharing;
    } catch (error) {
        console.error('保存到LeanCloud失败:', error);
        throw error;
    }
}

// 从LeanCloud加载消息（第二单元）
async function loadSharedMessages2() {
    try {
        // 清空现有消息（保留示例消息）
        const sharedMessages = document.getElementById('sharedMessages2');
        const sampleMessage = sharedMessages.querySelector('.sample-message');
        const existingMessages = sharedMessages.querySelectorAll('.shared-message:not(.sample-message)');
        existingMessages.forEach(msg => msg.remove());
        
        // 查询LeanCloud中的分享消息
        const query = new AV.Query('StudentSharing');
        query.equalTo('unit', 'Unit 2'); // 只加载第二单元的消息
        query.descending('createdAt'); // 按创建时间降序排列
        query.limit(50); // 限制最多50条
        
        const results = await query.find();
        
        // 显示消息
        results.forEach(sharing => {
            const message = {
                id: sharing.id,
                author: sharing.get('author') || '匿名用户',
                content: sharing.get('content') || '',
                time: sharing.createdAt.toLocaleString('zh-CN', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                })
            };
            
            // 确保字符串数据正确处理
            if (typeof message.author === 'string' && typeof message.content === 'string') {
                const isPinned = message.author === 'user';
                addMessageToDisplay2(message, isPinned);
            }
        });
        
    } catch (error) {
        console.error('从LeanCloud加载消息失败:', error);
        // 如果云端加载失败，尝试加载本地备份
        loadLocalBackupMessages2();
    }
}

// 加载本地备份消息（第二单元）
function loadLocalBackupMessages2() {
    try {
        const messages = JSON.parse(localStorage.getItem('sharedMessages2') || '[]');
        messages.forEach(message => {
            addMessageToDisplay2(message);
        });
    } catch (error) {
        console.error('加载本地备份消息失败:', error);
    }
}

// 确认删除消息（第二单元）
function confirmDeleteMessage2(messageId) {
    if (confirm('确定要删除这条评论吗？删除后无法恢复。')) {
        deleteMessage2(messageId);
    }
}

// 删除消息函数（第二单元）
async function deleteMessage2(messageId) {
    try {
        // 从LeanCloud删除消息
        const query = new AV.Query('StudentSharing');
        const sharing = await query.get(messageId);
        
        // 验证是否是当前用户的消息
        if (sharing.get('author') !== currentUser) {
            alert('您只能删除自己的评论！');
            return;
        }
        
        await sharing.destroy();
        
        // 从页面移除消息元素
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            messageElement.remove();
        }
        
        showSuccessMessage('评论已删除');
        
    } catch (error) {
         console.error('删除消息失败:', error);
         alert('删除失败，请稍后重试');
     }
 }

// 初始化第二单元评论区折叠功能
function initializeSharingCollapse2() {
    const collapseBtn = document.getElementById('collapseSharing2');
    const sharingContent = document.getElementById('sharingContent2');
    
    if (!collapseBtn || !sharingContent) {
        console.warn('第二单元折叠按钮或内容区域未找到');
        return;
    }
    
    // 从本地存储读取折叠状态
    const isCollapsed = localStorage.getItem('sharingCollapsed2') === 'true';
    
    // 设置初始状态
    if (isCollapsed) {
        sharingContent.classList.add('collapsed');
        collapseBtn.classList.add('collapsed');
    }
    
    // 添加点击事件监听器
    collapseBtn.addEventListener('click', function() {
        const isCurrentlyCollapsed = sharingContent.classList.contains('collapsed');
        
        if (isCurrentlyCollapsed) {
            // 展开
            sharingContent.classList.remove('collapsed');
            collapseBtn.classList.remove('collapsed');
            localStorage.setItem('sharingCollapsed2', 'false');
        } else {
            // 折叠
            sharingContent.classList.add('collapsed');
            collapseBtn.classList.add('collapsed');
            localStorage.setItem('sharingCollapsed2', 'true');
        }
    });
}

// 导航栏功能
function initializeUnitNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const units = document.querySelectorAll('.unit');
    
    // 初始化：显示第一个单元
    showUnit('unit1');
    
    // 为每个导航链接添加点击事件
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetUnit = this.getAttribute('data-unit');
            showUnit(targetUnit);
            
            // 更新导航链接的活动状态
            updateActiveNavLink(this);
            
            // 平滑滚动到页面顶部
            scrollToTop();
        });
    });
    
    // 显示指定单元的函数
    function showUnit(unitId) {
        units.forEach(unit => {
            const isTarget = unit.id === unitId;
            if (isTarget) {
                unit.classList.add('active');
                // 自动展开该单元内所有相关板块（不改变用户当前焦点）
                // 1) 展开所有 .collapsible-content（课程目标等）
                const contents = unit.querySelectorAll('.collapsible-content');
                contents.forEach(content => {
                    if (content.classList.contains('collapsed')) {
                        content.classList.remove('collapsed');
                        // 根据现有逻辑重算高度，避免跳动
                        content.style.maxHeight = 'none';
                        content.offsetHeight; // 强制重绘
                        const calculatedHeight = Math.max(content.scrollHeight, content.offsetHeight) + 100;
                        content.style.maxHeight = calculatedHeight + 'px';
                        // 同步图标状态
                        const header = content.previousElementSibling;
                        if (header && header.classList.contains('collapsible')) {
                            const icon = header.querySelector('.toggle-icon');
                            if (icon) icon.classList.remove('rotated');
                        }
                    }
                });

                // 2) 展开该单元内所有学生交流/教师私密等 sharing-content
                const sharingContents = unit.querySelectorAll('.sharing-content');
                sharingContents.forEach(sc => {
                    if (sc.classList.contains('collapsed')) {
                        sc.classList.remove('collapsed');
                        sc.setAttribute('aria-hidden', 'false');
                        const btn = sc.closest('.student-sharing-section, .teacher-private-section')?.querySelector('.collapse-btn');
                        if (btn) {
                            btn.classList.remove('collapsed');
                            btn.setAttribute('aria-expanded', 'true');
                            const icon = btn.querySelector('.collapse-icon');
                            if (icon) icon.textContent = '▼';
                        }
                    }
                });
            } else {
                unit.classList.remove('active');
            }
        });
    }
    
    // 更新导航链接活动状态
    function updateActiveNavLink(activeLink) {
        navLinks.forEach(link => {
            link.classList.remove('active');
        });
        activeLink.classList.add('active');
    }
    
    // 平滑滚动到页面顶部
    function scrollToTop() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }
    
    // 监听滚动事件，根据当前可见的单元更新导航状态
    function handleScroll() {
        const scrollPosition = window.scrollY + 100; // 考虑导航栏高度
        
        units.forEach(unit => {
            if (unit.classList.contains('active')) {
                const unitTop = unit.offsetTop;
                const unitBottom = unitTop + unit.offsetHeight;
                
                if (scrollPosition >= unitTop && scrollPosition < unitBottom) {
                    const correspondingNavLink = document.querySelector(`[data-unit="${unit.id}"]`);
                    if (correspondingNavLink && !correspondingNavLink.classList.contains('active')) {
                        updateActiveNavLink(correspondingNavLink);
                    }
                }
            }
        });
    }
    
    // 节流函数，优化滚动性能
    function throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        }
    }
    
    // 添加滚动监听（节流处理）
    window.addEventListener('scroll', throttle(handleScroll, 100));
    
    // 键盘导航支持
    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey || e.metaKey) {
            const currentActiveLink = document.querySelector('.nav-link.active');
            const currentIndex = Array.from(navLinks).indexOf(currentActiveLink);
            
            switch(e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    if (currentIndex > 0) {
                        navLinks[currentIndex - 1].click();
                    }
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    if (currentIndex < navLinks.length - 1) {
                        navLinks[currentIndex + 1].click();
                    }
                    break;
                case '1':
                case '2':
                case '3':
                case '4':
                    e.preventDefault();
                    const unitIndex = parseInt(e.key) - 1;
                    if (unitIndex < navLinks.length) {
                        navLinks[unitIndex].click();
                    }
                    break;
            }
        }
    });
}

// 在页面加载完成后初始化导航功能
document.addEventListener('DOMContentLoaded', function() {
    // 等待其他初始化完成后再初始化导航
    setTimeout(() => {
        initializeUnitNavigation();
    }, 100);
});

// 初始化教师私密评论区（适用于 index.html 中的 unit1~unit4 及动态渲染单元）
function initializeTeacherPrivateSections() {
  // 为静态单元（index.html 的 unit1~unit4）补充教师私密评论区
  const unitBlocks = document.querySelectorAll('.unit');
  unitBlocks.forEach(unit => {
    if (!unit.querySelector('.teacher-private-section')) {
      const unitIdentifier = unit.id || 'unit';
      const privateSection = document.createElement('div');
      privateSection.className = 'student-sharing-section teacher-private-section';
      privateSection.setAttribute('data-unit', unitIdentifier);
      const titleId = `private-title-${unitIdentifier}`;
      privateSection.innerHTML = `
        <div class="sharing-header">
          <h4 class="sharing-title" id="${titleId}">👩‍🏫 教师留言 <span class="privacy-badge" aria-label="仅教师与该学生可见"></span></h4>
          <button class="collapse-btn" title="折叠/展开评论区" aria-expanded="true">
            <span class="collapse-icon">▼</span>
          </button>
        </div>
        <div class="sharing-content teacher-private" role="region" aria-labelledby="${titleId}" aria-hidden="false">
          <p class="sharing-description">这是一对一的交流，仅你与教师可见。</p>
          <div class="teacher-private-controls" style="margin-bottom:8px;">
            <label style="display:${(currentUser === 'teacher') ? 'inline-block' : 'none'}; margin-right:8px;">选择学生：</label>
            <select class="teacher-student-select" aria-label="选择学生" style="display:${(currentUser === 'teacher') ? 'inline-block' : 'none'};"></select>
          </div>
          <div class="sharing-form">
            <textarea class="sharing-textarea" aria-label=留言输入" rows="3" placeholder="在此与教师进行交流，仅你与教师可见"></textarea>
            <div class="sharing-actions">
              <button class="submit-sharing-btn" aria-label="发送留言">📝 发送</button>
            </div>
          </div>
          <div class="shared-content">
            <h5 class="shared-title">对话</h5>
            <div class="shared-messages teacher-comments-list" aria-live="polite"></div>
          </div>
        </div>
      `;
      unit.appendChild(privateSection);
    }
  });

  // 绑定事件与首次加载
  bindTeacherPrivateEvents();
}

function bindTeacherPrivateEvents() {
  const sections = document.querySelectorAll('.teacher-private-section');
  sections.forEach(section => {
    // 防止重复绑定导致重复发送
    if (section.dataset.bound === '1') return;
    section.dataset.bound = '1';
    const unitId = section.getAttribute('data-unit') || (section.closest('.unit')?.id) || 'unit';
    const selectEl = section.querySelector('.teacher-student-select');
    const inputEl = section.querySelector('.sharing-textarea');
    const listEl = section.querySelector('.teacher-comments-list');
    const toggleBtn = section.querySelector('.collapse-btn');
    const contentWrap = section.querySelector('.teacher-private');

    if (toggleBtn && contentWrap) {
      toggleBtn.addEventListener('click', () => {
        const icon = toggleBtn.querySelector('.collapse-icon');
        const isCollapsed = contentWrap.classList.contains('collapsed');
        if (isCollapsed) {
          contentWrap.classList.remove('collapsed');
          toggleBtn.classList.remove('collapsed');
          contentWrap.setAttribute('aria-hidden', 'false');
          toggleBtn.setAttribute('aria-expanded', 'true');
          if (icon) icon.textContent = '▼';
        } else {
          contentWrap.classList.add('collapsed');
          toggleBtn.classList.add('collapsed');
          contentWrap.setAttribute('aria-hidden', 'true');
          toggleBtn.setAttribute('aria-expanded', 'false');
          if (icon) icon.textContent = '▲';
        }
      });
    }

    // 填充教师视角学生列表
    if (selectEl && currentUser === 'teacher') {
      const validUsers = getValidUsersMap();
      selectEl.innerHTML = '';
      Object.keys(validUsers).filter(u => u !== 'teacher').forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        selectEl.appendChild(opt);
      });
    }

    // 发送评论
    const submitBtn = section.querySelector('.submit-sharing-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        const text = (inputEl && inputEl.value || '').trim();
        if (!text) return;
        const studentName = currentUser === 'teacher' ? (selectEl && selectEl.value) : currentUser;
        if (!studentName) {
          alert('请选择学生');
          return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = '发送中...';
        try {
          await postPrivateComment({ unitId, text, studentName });
          if (inputEl) inputEl.value = '';
          await loadPrivateComments({ unitId, studentName, listEl });
        } catch (e) {
          alert('发送失败：' + e.message);
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = '📝 发送';
        }
      });
    }

    // 初始加载
    const initialStudent = currentUser === 'teacher' ? (selectEl && selectEl.value) : currentUser;
    if (initialStudent) {
      loadPrivateComments({ unitId, studentName: initialStudent, listEl });
    }

    // 教师切换学生后刷新内容
    if (selectEl && currentUser === 'teacher') {
      selectEl.addEventListener('change', () => {
        loadPrivateComments({ unitId, studentName: selectEl.value, listEl });
      });
    }

    // 学生侧：为留言列表绑定编辑/删除事件（事件委托）
    if (listEl && currentUser !== 'teacher') {
      listEl.addEventListener('click', async (e) => {
        const target = e.target;
        const itemEl = target.closest('.shared-message');
        if (!itemEl) return;
        const commentId = itemEl.getAttribute('data-message-id');
        const authorId = itemEl.getAttribute('data-author-id');
        const studentName = currentUser;

        // 删除留言
        if (target.classList.contains('delete-comment-btn')) {
          if (!commentId) return;
          if (!confirm('确定删除这条留言吗？')) return;
          try {
            await deletePrivateComment({ commentId, authorId });
            await loadPrivateComments({ unitId, studentName, listEl });
          } catch (err) {
            alert('删除失败：' + err.message);
          }
          return;
        }

        // 进入编辑模式
        if (target.classList.contains('edit-comment-btn')) {
          const contentEl = itemEl.querySelector('.message-content');
          if (!contentEl) return;
          // 防止重复进入编辑
          if (itemEl.dataset.editing === '1') return;
          itemEl.dataset.editing = '1';
          const originalText = contentEl.textContent || '';
          contentEl.innerHTML = '';
          const textarea = document.createElement('textarea');
          textarea.className = 'sharing-textarea';
          textarea.value = originalText;
          textarea.rows = Math.max(3, Math.min(8, Math.ceil(originalText.length / 60)));
          const actions = document.createElement('div');
          actions.className = 'sharing-actions';
          const saveBtn = document.createElement('button');
          saveBtn.className = 'submit-sharing-btn save-edit-btn';
          saveBtn.textContent = '💾 保存';
          const cancelBtn = document.createElement('button');
          cancelBtn.className = 'clear-sharing-btn cancel-edit-btn';
          cancelBtn.textContent = '✖️ 取消';
          actions.appendChild(saveBtn);
          actions.appendChild(cancelBtn);
          contentEl.appendChild(textarea);
          contentEl.appendChild(actions);

          // 保存编辑
          saveBtn.addEventListener('click', async () => {
            const newText = (textarea.value || '').trim();
            if (!newText) {
              alert('留言内容不能为空');
              return;
            }
            if (newText.length > 500) {
              alert('留言内容不能超过500字符');
              return;
            }
            saveBtn.disabled = true;
            saveBtn.textContent = '保存中...';
            try {
              await updatePrivateComment({ commentId, newText, authorId });
              await loadPrivateComments({ unitId, studentName, listEl });
            } catch (err) {
              alert('保存失败：' + err.message);
            } finally {
              itemEl.dataset.editing = '0';
            }
          });

          // 取消编辑
          cancelBtn.addEventListener('click', () => {
            itemEl.dataset.editing = '0';
            contentEl.textContent = originalText;
          });
        }
      });
    }
  });
}

function getValidUsersMap() {
  // 与登录处相同的有效账户映射（保持同步）
  return {
    'user': '123456',
    'user1': '123456',
    'test':'123456',
    'user2': '123456',
    'teacher': '123456',
    'Kitty': '20121220',
    'Serena': '20111208',
    'Jessica': '20130825',
    'Celeste': '20120913',
    'Valentina': '20120913',
    'Roxy': '20130117',
    'Mark': '20120512',
    'Cindy': '20130608',
    'Alice': '20120131',
    'Nolan': '20130130',
    'Raye': '20130828',
    'Tanya': '20130706',
    'Yiyi': '20121101',
    'Rockey': '20121108',
    'Terrence': '20120419',
    'Steven': '20130521',
    'Austin': '20130304',
    'TJ': '20130128',
    'Chris': '20121225',
    'Jason': '20121126',
    'Abby': '20120601'
  };
}

async function postPrivateComment({ unitId, text, studentName }) {
  if (!NEW_LC.user) throw new Error('未登录评论服务');
  const validUsers = getValidUsersMap();
  const studentId = await getStudentObjectId(studentName, validUsers);
  const teacherId = await ensureTeacherUser();
  const body = {
    unitId,
    text,
    authorId: NEW_LC.user.objectId,
    authorName: NEW_LC.user.username || currentUser,
    studentName,
    // 仅作者可写入，师生均可读取，确保安全性
    ACL: {
      [studentId]: { read: true, write: (NEW_LC.user.objectId === studentId) },
      // 始终允许教师读写，确保教师面板可编辑/删除任何私密留言
      [teacherId]: { read: true, write: true }
    }
  };
  await lcRequest('/classes/TeacherComment', { method: 'POST', body });
}

async function loadPrivateComments({ unitId, studentName, listEl }) {
  if (!listEl) return;
  listEl.innerHTML = '<div style="color:#888;">加载中...</div>';
  try {
    const where = encodeURIComponent(JSON.stringify({ unitId, studentName }));
    const res = await lcRequest(`/classes/TeacherComment?where=${where}&order=-createdAt`, { method: 'GET' });
    const items = Array.isArray(res.results) ? res.results : [];
    listEl.innerHTML = '';
    if (items.length === 0) {
      listEl.innerHTML = '<div style="color:#888;">暂时没有留言</div>';
      return;
    }
    items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'shared-message';
      div.setAttribute('data-message-id', item.objectId || '');
      if (item.authorId) div.setAttribute('data-author-id', item.authorId);
      const time = new Date(item.createdAt).toLocaleString();
      const canEdit = (currentUser !== 'teacher') && NEW_LC.user && (item.authorId === NEW_LC.user.objectId);
      div.innerHTML = `
        <div class="message-header">
          <span class="message-author">${item.authorName || '匿名'}</span>
          <span class="message-time">${time}</span>
          ${canEdit ? `
            <div class="message-actions">
              <button class="edit-comment-btn clear-sharing-btn" aria-label="编辑留言">✏️ 编辑</button>
              <button class="delete-comment-btn clear-sharing-btn" aria-label="删除留言">🗑️ 删除</button>
            </div>
          ` : ''}
        </div>
        <div class="message-content">${escapeHtml(item.text || '')}</div>
      `;
      listEl.appendChild(div);
    });
  } catch (e) {
    listEl.innerHTML = `<div style="color:#c00;">加载失败：${e.message}</div>`;
  }
}

async function updatePrivateComment({ commentId, newText, authorId }) {
  if (!NEW_LC.user) throw new Error('未登录评论服务');
  if (!commentId) throw new Error('无效的留言ID');
  if (authorId && authorId !== NEW_LC.user.objectId) throw new Error('仅可编辑自己创建的留言');
  if (!newText || !newText.trim()) throw new Error('留言内容不能为空');
  if (newText.length > 500) throw new Error('留言内容不能超过500字符');
  await lcRequest(`/classes/TeacherComment/${commentId}`, { method: 'PUT', body: { text: newText } });
}

async function deletePrivateComment({ commentId, authorId }) {
  if (!NEW_LC.user) throw new Error('未登录评论服务');
  if (!commentId) throw new Error('无效的留言ID');
  if (authorId && authorId !== NEW_LC.user.objectId) throw new Error('仅可删除自己创建的留言');
  await lcRequest(`/classes/TeacherComment/${commentId}`, { method: 'DELETE' });
}
