# 골프존파크 도안빈스점 매출 관리 - 배포 안내

## 사전 준비물
- GitHub 계정 (무료): https://github.com
- Render 계정 (무료): https://render.com

---

## STEP 1 — GitHub에 코드 올리기

1. https://github.com 접속 → 로그인 → **New repository** 클릭
2. Repository name: `golf-sales` → **Create repository**
3. 카운터PC에서 Git Bash(또는 터미널) 열고 아래 명령 실행:

```bash
cd C:/Users/lky32/golf-sales
git init
git add .
git commit -m "초기 배포"
git remote add origin https://github.com/[내GitHub아이디]/golf-sales.git
git push -u origin main
```

---

## STEP 2 — Render에서 PostgreSQL 데이터베이스 만들기

1. https://render.com 접속 → 로그인
2. **New +** → **PostgreSQL** 클릭
3. 설정:
   - Name: `golf-sales-db`
   - Region: Singapore (가장 가까운 곳)
   - Plan: **Free**
4. **Create Database** 클릭
5. 생성 완료 후 **Internal Database URL** 복사 (나중에 사용)

---

## STEP 3 — Render에서 웹 서비스 만들기

1. **New +** → **Web Service** 클릭
2. GitHub 연결 → `golf-sales` 저장소 선택
3. 설정:
   - Name: `golf-sales`
   - Region: Singapore
   - Branch: `main`
   - Runtime: **Node**
   - Build Command: `npm install`
   - Start Command: `node server.js`
   - Plan: **Free**
4. **Environment Variables** 섹션에서 아래 추가:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | (STEP 2에서 복사한 Internal URL) |
| `JWT_SECRET` | 임의의 긴 문자열 (예: `golfzone-doan-bins-2024-secret-key`) |
| `ADMIN_USERNAME` | 원하는 아이디 (예: `golfzone`) |
| `ADMIN_PASSWORD` | 원하는 비밀번호 (예: `bins1234`) |
| `NODE_ENV` | `production` |

5. **Create Web Service** 클릭

---

## STEP 4 — 접속 확인

- 배포 완료 후 Render에서 URL 확인 (예: `https://golf-sales.onrender.com`)
- 해당 URL로 접속 → 로그인 화면 확인
- 설정한 아이디/비밀번호로 로그인

### 주의사항
- **Render 무료 플랜**은 15분간 접속이 없으면 서버가 잠들어요.
  다시 접속하면 30~60초 후 깨어납니다.
- 카운터PC 탭을 항상 열어두면 잠들지 않아요.
- 데이터는 PostgreSQL에 저장되므로 서버가 재시작되어도 **데이터는 보존**됩니다.

---

## 로컬에서 테스트하려면 (선택사항)

1. Node.js 설치: https://nodejs.org (LTS 버전)
2. PostgreSQL 설치 또는 로컬 DB 없이 Render DB URL 사용
3. `.env.example`을 복사해 `.env` 파일 생성 후 값 입력
4. 터미널에서:
```bash
cd C:/Users/lky32/golf-sales
npm install
npm start
```
5. 브라우저에서 http://localhost:3000 접속

---

## 문의
배포 중 막히는 부분이 있으면 화면 캡처와 함께 문의해주세요.
