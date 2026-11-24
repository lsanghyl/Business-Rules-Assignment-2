import { AppError, missing, forbidden, invalidState } from './errors.js';

function transaction(repo, work) {
  repo.db.exec('BEGIN IMMEDIATE');

  try {
    const result = work();
    repo.db.exec('COMMIT');
    return result;
  } catch (error) {
    repo.db.exec('ROLLBACK');
    throw error;
  }
}

// TODO-01~04: 업무 규칙과 트랜잭션을 직접 구현합니다. docs/API.md를 먼저 읽으세요.
// actor는 검증된 로그인 사용자입니다. repo의 저장 함수는 권한을 검사하지 않습니다.
// 상태 변경과 이력 저장은 함께 성공하거나 함께 실패해야 합니다.
// 승인 취소와 자동 승급은 신청 2건 + 이력 2건을 한 트랜잭션으로 처리합니다.
export function createApplicationService(repo) {
  return {
   apply(actor, eventId) {
  return transaction(repo, () => {
    // 1. 행사 존재 확인
    const event = repo.event(eventId);
    if (!event) {
      throw missing('행사');
    }

    // 2. 학생 역할 확인
    if (actor.role !== 'STUDENT') {
      throw forbidden();
    }

    // 3. 중복 신청 확인
    if (repo.existing(eventId, actor.id)) {
      throw new AppError(
        409,
        'ALREADY_APPLIED',
        '이미 신청한 행사입니다.'
      );
    }

    // 4. PENDING 상태로 신청 저장
    const application = repo.insert(eventId, actor.id);

    // 5. 신청 이력 저장
    repo.addHistory({
      applicationId: application.id,
      actorId: actor.id,
      action: 'APPLY',
      fromStatus: null,
      toStatus: 'PENDING'
    });

    // 6. 신청 객체 반환
    return application;
  });
},
    cancel(actor, applicationId) {
  return transaction(repo, () => {
    // 1. 신청 존재 확인
    const application = repo.application(applicationId);

    if (!application) {
      throw missing('신청');
    }

    // 2. 학생 역할 및 신청 소유자 확인
    if (
      actor.role !== 'STUDENT' ||
      application.userId !== actor.id
    ) {
      throw forbidden();
    }

    // 3. 현재 상태 확인
    if (application.status !== 'PENDING') {
      throw invalidState();
    }

    // 4. CANCELLED 상태로 변경
    const cancelled = repo.setStatus(
      applicationId,
      'CANCELLED'
    );

    // 5. 취소 이력 저장
    repo.addHistory({
      applicationId: applicationId,
      actorId: actor.id,
      action: 'CANCEL',
      fromStatus: application.status,
      toStatus: 'CANCELLED'
    });

    // 6. 변경된 신청 객체 반환
    return cancelled;
  });
},
    approve(actor, applicationId) {
  return transaction(repo, () => {
    // 1. 신청 존재 확인
    const application = repo.application(applicationId);

    if (!application) {
      throw missing('신청');
    }

    // 2. 행사 조회
    const event = repo.event(application.eventId);

    if (!event) {
      throw missing('행사');
    }

    // 3. 담당 운영자 권한 확인
    if (
      actor.role !== 'MANAGER' ||
      event.managerId !== actor.id
    ) {
      throw forbidden();
    }

    // 4. 현재 신청 상태 확인
    if (application.status !== 'PENDING') {
      throw invalidState();
    }

    // 5. 승인 인원 및 정원 확인
    const approvedCount = repo.approvedCount(event.id);

    if (approvedCount >= event.capacity) {
      throw new AppError(
        409,
        'CAPACITY_FULL',
        '행사 정원이 가득 찼습니다.'
      );
    }

    // 6. APPROVED 상태로 변경
    const approved = repo.setStatus(
      applicationId,
      'APPROVED'
    );

    // 7. 승인 이력 저장
    repo.addHistory({
      applicationId: applicationId,
      actorId: actor.id,
      action: 'APPROVE',
      fromStatus: application.status,
      toStatus: 'APPROVED'
    });

    // 8. 변경된 신청 객체 반환
    return approved;
  });
},
    revoke(actor, applicationId, reason) {
  return transaction(repo, () => {
    // 1. 신청 존재 확인
    const application = repo.application(applicationId);

    if (!application) {
      throw missing('신청');
    }

    // 2. 행사 존재 확인
    const event = repo.event(application.eventId);

    if (!event) {
      throw missing('행사');
    }

    // 3. 담당 운영자 권한 확인
    if (
      actor.role !== 'MANAGER' ||
      event.managerId !== actor.id
    ) {
      throw forbidden();
    }

    // 4. 현재 신청 상태 확인
    if (application.status !== 'APPROVED') {
      throw invalidState();
    }

    // 5. 기존 신청을 REVOKED로 변경
    const revoked = repo.setStatus(
      applicationId,
      'REVOKED'
    );

    // 6. 승인 취소 이력 저장
    const revokeHistoryId = repo.addHistory({
      applicationId: applicationId,
      actorId: actor.id,
      action: 'REVOKE',
      fromStatus: 'APPROVED',
      toStatus: 'REVOKED',
      reason: reason.trim()
    });

    // 7. FIFO 기준 다음 대기자 조회
    const next = repo.nextPending(event.id);

    let promoted = null;

    // 8. 대기자가 존재하면 자동 승급
    if (next) {
      promoted = repo.setStatus(
        next.id,
        'APPROVED'
      );

      // 9. 자동 승급 이력 저장
      repo.addHistory({
        applicationId: next.id,
        actorId: actor.id,
        action: 'AUTO_APPROVE',
        fromStatus: 'PENDING',
        toStatus: 'APPROVED',
        causeHistoryId: revokeHistoryId
      });
    }

    // 10. 승인 취소 및 자동 승급 결과 반환
    return { revoked, promoted };
  });
}
  };
}
