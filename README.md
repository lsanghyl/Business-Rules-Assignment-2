# 과제 2 - 신청 승인 서비스의 업무 규칙과 트랜잭션

## 1. 프로젝트 소개

학생의 행사 신청, 대기 취소, 운영자의 직접 승인 및 승인 취소,
대기열 자동 승급과 변경 이력 관리를 제공하는 웹 서비스입니다.

업무 규칙에 따른 권한 및 상태 검사, 정원 관리, FIFO 대기열 처리,
트랜잭션을 통한 데이터 일관성 보장을 목표로 구현하였습니다.

## 2. 개발 환경

- OS: Windows
- IDE: Visual Studio Code
- Runtime: Node.js 24.x
- Backend: Express
- Database: SQLite (node:sqlite)
- Authentication: JWT
- Version Control: Git / GitHub

## 3. 주요 구현 기능

| 구분 | 구현 내용 | 상태 |
|---|---|---|
| TODO-01 | 행사 신청 및 중복 신청 방지 | 완료 |
| TODO-02 | 학생 본인의 대기 신청 취소 | 완료 |
| TODO-03 | 담당 운영자의 승인 및 정원 검사 | 완료 |
| TODO-04 | 승인 취소 및 FIFO 자동 승급 | 완료 |
| 공통 | 상태 변경 및 변경 이력 저장 | 완료 |
| 공통 | 트랜잭션 및 오류 발생 시 롤백 | 완료 |
| 심화 | 동시 승인 요청 검증 | 완료 |

## 4. 주요 설계

### 상태 전이

- 신규 신청 → PENDING
- PENDING → CANCELLED: 학생 본인의 대기 취소
- PENDING → APPROVED: 담당 운영자의 승인 또는 자동 승급
- APPROVED → REVOKED: 담당 운영자의 승인 취소

허용되지 않은 상태 전이는 거부하며, CANCELLED 및 REVOKED 상태에서
동일 행사에 다시 신청할 수 없습니다.

### FIFO 자동 승급

승인 취소 시 동일 행사의 PENDING 신청 중 다음 기준으로
대기자 한 명을 선택하여 자동 승인합니다.

```sql
WHERE a.event_id = ?
  AND a.status = 'PENDING'
ORDER BY a.created_at ASC, a.id ASC
LIMIT 1
```

대기자가 없으면 자동 승급 없이 승인 취소만 수행합니다.

### 트랜잭션

모든 상태 변경과 이력 저장은 하나의 트랜잭션에서 처리합니다.

- BEGIN IMMEDIATE: 쓰기 트랜잭션 시작
- COMMIT: 모든 작업 성공 시 변경 사항 확정
- ROLLBACK: 오류 발생 시 전체 변경 사항 취소

승인 취소와 자동 승급은 동일한 트랜잭션에서 처리하며,
AUTO_APPROVE 이력의 causeHistoryId를 통해 REVOKE 이력과 연결합니다.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| src/application-service.js | TODO-01~04 및 트랜잭션 함수 구현 |
| src/repository.js | FIFO 대기자 조회 함수 nextPending 추가 |
| .gitignore | DB 및 인증 관련 파일 제외 규칙 보완 |
| README.md | 구현 내용 및 실행·검증 방법 작성 |

로그인, JWT 인증, DB 스키마, 조회 API, 입력 형식 검사,
기본 UI 및 테스트 코드는 제공된 시작 코드를 활용하였습니다.

## 6. 설치 및 실행

Node.js 24.x와 npm이 필요합니다.

```sh
node --version
npm ci
npm start
```

브라우저 접속 주소:

http://127.0.0.1:3000

서버는 Ctrl+C로 종료합니다.

첫 실행 시 SQLite DB와 JWT 서명 키가 자동 생성됩니다.
별도의 환경 설정 파일은 필요하지 않습니다.

## 7. 테스트 계정

공통 비밀번호: Classroom123!

아래 계정은 과제에서 제공한 가상 계정입니다.

| 아이디 | 이름 | 역할 |
|---|---|---|
| alice | 민지 | 학생 |
| bob | 준호 | 학생 |
| charlie | 서연 | 학생 |
| manager1 | 운영자 A | 행사 1 담당 (정원 2명) |
| manager2 | 운영자 B | 행사 2 담당 (정원 1명) |

브라우저 새로고침 후에는 다시 로그인해야 하며,
서버에 저장된 신청 상태와 변경 이력은 유지됩니다.

## 8. DB 초기화

서버를 종료한 후 다음 명령어를 실행합니다.

```sh
npm run db:reset
```

확인 메시지에 RESET을 입력하면 신청 및 변경 이력이 초기화됩니다.

## 9. 테스트 실행 및 결과

```sh
npm test
npm run test:assignment
npm run test:advanced
```

| 테스트 | 결과 |
|---|---|
| 기본 테스트 | 4/4 PASS |
| 필수 테스트 T01~T32 | 32/32 PASS |
| UI 검증 U01~U05 | 5/5 PASS |
| 선택 심화 테스트 | 1/1 PASS |

### 주요 검증 내용

- 권한에 따른 신청 및 승인 제한
- 중복 신청 방지
- 잘못된 상태 전이 거부
- 행사 정원 초과 방지
- FIFO 대기열 자동 승급
- 승인 취소 및 자동 승급 이력 연결
- 오래된 화면에서 발생한 승인 요청 거부
- 서버 재실행 후 데이터 및 이력 유지
- 이력 저장 실패 시 트랜잭션 롤백
- 동시 승인 요청에 대한 정원 초과 방지

T28~T30의 TEST_INJECTED_FAILURE는 롤백 검증을 위해
의도적으로 발생시킨 오류입니다.

## 10. 프로젝트 구조

```text
starter/
├── data/
├── docs/
│   └── API.md
├── public/
├── scripts/
├── src/
│   ├── app.js
│   ├── application-service.js
│   ├── auth.js
│   ├── db.js
│   ├── errors.js
│   ├── repository.js
│   └── server.js
├── tests/
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

## 11. 알려진 문제 및 한계

- 수행한 자동 테스트 범위에서 확인된 실패는 없습니다.
- 다른 브라우저 탭의 변경 사항은 실시간으로 반영되지 않으므로
  최신 정보 새로고침이 필요합니다.
- 동시성 검증은 제공된 선택 심화 테스트 범위에서 수행하였습니다.
- 운영 환경의 대규모 부하 및 DB 마이그레이션은 검증 범위에 포함하지 않았습니다.

## 12. AI 활용

ChatGPT를 활용하여 과제 요구사항 분석, 업무 규칙 설계,
트랜잭션 구현, 코드 검토 및 테스트 결과 분석을 진행하였습니다.

제안된 코드를 개발 환경에 적용하고, 자동 테스트와 브라우저 UI
검증을 직접 수행하여 구현 결과를 확인하였습니다.

## 13. 보고서 및 참고 자료

- 제출 보고서: docs/report.pdf (추가 예정)
- [API 계약](docs/API.md)
- [Node.js SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)
- [Express API](https://expressjs.com/en/5x/api/)
- [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken)
