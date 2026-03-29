async function login() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  const errorDiv = document.getElementById('error');
  errorDiv.innerText = '';

  try {
    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.log('❌ JSON 아님:', text);
      errorDiv.innerText = '서버 응답 오류';
      return;
    }

    if (data.success) {
      alert('로그인 성공 🎉');
    } else {
      errorDiv.innerText = data.message || '로그인 실패';
    }

  } catch (err) {
    console.log(err);
    errorDiv.innerText = '서버 연결 실패';
  }
}