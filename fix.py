import sys

with open('index.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_content = """        // ==========================================
        // 🔒 Firebase Auth 하이브리드 안정화 버전
        // ==========================================

        // 1. 세션 유지 설정 (출입증 시멘트 바르기)
        auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
            .then(() => console.log("✅ 세션 유지 설정 완료"))
            .catch((error) => console.error("❌ 세션 설정 에러:", error));

        // 2. 가림막 강제 철거 함수
        function forceClearAll() {
            const splash = document.getElementById('splashScreen');
            const rings = document.getElementById('loadingRings');
            if (splash) splash.style.display = 'none';
            if (rings) rings.style.display = 'none';

            const mainApp = document.getElementById('mainApp');
            if (mainApp) {
                mainApp.classList.remove('hidden');
                mainApp.style.display = 'flex';
                mainApp.style.opacity = '1';
            }
        }

        // 3. 로그인 안내 화면 렌더링
        function renderLoginPrompt() {
            const contentArea = document.getElementById('contentArea');
            if (!contentArea) return;
            contentArea.innerHTML = `
            <div class="flex flex-col items-center justify-center w-full h-full bg-slate-50 p-8">
                <div class="w-24 h-24 bg-white rounded-3xl shadow-sm flex items-center justify-center mb-6 border border-slate-100">
                    <i class="fa-solid fa-lock text-4xl text-slate-300"></i>
                </div>
                <h3 class="text-2xl font-black text-slate-800 mb-2">Project LEE V3.8</h3>
                <p class="text-slate-500 mb-8 text-center max-w-sm">시스템에 접근하려면 관리자 로그인이 필요합니다.</p>
                <button onclick="toggleAuth()" class="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg transition-all hover:scale-105 flex items-center gap-3">
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" class="w-5 h-5 bg-white rounded-full p-0.5" alt="G"> 
                    Google 계정으로 시작하기
                </button>
            </div>`;
        }

        // 4. 🔥 핵심: 하이브리드 로그인 함수
        function toggleAuth() {
            if (currentUser) {
                auth.signOut().then(() => window.location.reload());
                return;
            }

            const provider = new firebase.auth.GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });

            // 1차 시도: 팝업 (가장 빠르고 에러가 적음)
            auth.signInWithPopup(provider).then((result) => {
                console.log("✅ 팝업 로그인 성공!");
                forceClearAll();
            }).catch((error) => {
                console.warn("⚠️ 팝업 차단됨, 리다이렉트로 우회 시도:", error);
                // 2차 시도: 팝업이 막히면 리다이렉트로 전환
                auth.signInWithRedirect(provider);
            });
        }

        // 5. 리다이렉트로 돌아왔을 때 결과 처리
        auth.getRedirectResult().then((result) => {
            if (result && result.user) {
                console.log("✅ 리다이렉트 로그인 성공!");
                forceClearAll();
            }
        }).catch((error) => {
            console.error("❌ 리다이렉트 에러:", error);
            forceClearAll();
            renderLoginPrompt();
        });

        // 6. 유저 상태 실시간 감지 (UI 업데이트)
        auth.onAuthStateChanged((user) => {
            forceClearAll(); // 로딩 제거
            
            const loginBtn = document.getElementById('loginBtn');
            const userProfile = document.getElementById('userProfile');
            const userName = document.getElementById('userName');
            const userPhoto = document.getElementById('userPhoto');
            const userInfoArea = document.getElementById('userInfoArea');

            if (user) {
                currentUser = user;
                const name = user.displayName || '관리자님';
                const photo = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`;

                if (loginBtn) loginBtn.style.display = 'none';
                if (userProfile) {
                    userProfile.style.display = 'flex';
                    if (userName) userName.textContent = name;
                    if (userPhoto) userPhoto.src = photo;
                }
                if (userInfoArea) {
                    userInfoArea.innerHTML = `
                        <img src="${photo}" class="w-10 h-10 rounded-full border-2 border-indigo-500">
                        <div class="overflow-hidden">
                            <p class="text-sm font-bold text-white truncate">${name}</p>
                            <p class="text-xs text-indigo-400">Executive Admin</p>
                        </div>`;
                }
                
                const contentArea = document.getElementById('contentArea');
                if (contentArea && contentArea.innerHTML.trim() === '') {
                    if (typeof navigateTo === 'function') navigateTo('home');
                }
            } else {
                currentUser = null;
                if (loginBtn) loginBtn.style.display = 'flex';
                if (userProfile) userProfile.style.display = 'none';
                if (userInfoArea) {
                    userInfoArea.innerHTML = `
                        <div class="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-500"><i class="fa-solid fa-user"></i></div>
                        <div><p class="text-sm font-bold text-slate-500">로그인 필요</p></div>`;
                }
                renderLoginPrompt();
            }
        });

        // 7. 최후의 2초 안전장치
        setTimeout(() => {
            forceClearAll();
            if (!currentUser) renderLoginPrompt();
        }, 2000);
"""

new_lines = [line + '\n' for line in new_content.split('\n')]
# Lines to replace are 243 (index 242) to 363 (index 362)
final_lines = lines[:242] + new_lines[:-1] + lines[363:]

with open('index.html', 'w', encoding='utf-8') as f:
    f.writelines(final_lines)

print('Success')
