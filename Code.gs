// ============================================================
// Google Apps Script — EchoFloor 게임 데이터 배포 메뉴
// 이 파일 전체를 스프레드시트의 Apps Script 편집기에 붙여넣기 하세요.
// ============================================================

var GITHUB_OWNER = 'turtlemoi';
var STATIC_REPO  = 'echofloor-static';
// GITHUB_PAT 는 스크립트 속성에서 관리 (하드코딩 금지)
// Apps Script 편집기 → 프로젝트 설정 → 스크립트 속성 → GITHUB_PAT 추가

function onOpen() {
    SpreadsheetApp.getUi()
        .createMenu('게임 데이터 배포')
        .addItem('서버에 최신화 적용', 'deployToServer')
        .addToUi();
}

function deployToServer() {
    var ui = SpreadsheetApp.getUi();

    var pat = PropertiesService.getScriptProperties().getProperty('GITHUB_PAT');
    if (!pat) {
        ui.alert(
            '⚙️ 설정 필요',
            'GITHUB_PAT 가 설정되지 않았습니다.\n' +
            'Apps Script → 프로젝트 설정 → 스크립트 속성에서\n' +
            'GITHUB_PAT 를 추가해주세요.',
            ui.ButtonSet.OK
        );
        return;
    }

    var confirm = ui.alert(
        '배포 확인',
        'GitHub Actions 를 통해 최신 게임 데이터를 배포합니다.\n' +
        '(약 1분 후 적용됩니다)\n\n계속하시겠습니까?',
        ui.ButtonSet.YES_NO
    );
    if (confirm !== ui.Button.YES) return;

    var url = 'https://api.github.com/repos/' + GITHUB_OWNER + '/' + STATIC_REPO +
              '/actions/workflows/update-sheets.yml/dispatches';

    var response;
    try {
        response = UrlFetchApp.fetch(url, {
            method:             'POST',
            headers: {
                'Authorization': 'token ' + pat,
                'Accept':        'application/vnd.github.v3+json',
                'Content-Type':  'application/json',
            },
            payload:            JSON.stringify({ ref: 'main' }),
            muteHttpExceptions: true,
        });
    } catch (e) {
        ui.alert('❌ 배포 실패', '요청 오류: ' + e.message, ui.ButtonSet.OK);
        return;
    }

    var code = response.getResponseCode();

    if (code === 204) {
        ui.alert(
            '✅ 배포 요청 완료',
            'GitHub Actions 가 실행됩니다.\n' +
            '약 1분 후 데이터가 갱신됩니다.\n\n' +
            '진행 상황: github.com/' + GITHUB_OWNER + '/' + STATIC_REPO + '/actions',
            ui.ButtonSet.OK
        );
    } else if (code === 401 || code === 403) {
        ui.alert(
            '❌ 인증 오류 (HTTP ' + code + ')',
            'GITHUB_PAT 가 유효하지 않거나 workflow 권한이 없습니다.\n' +
            'PAT 에 workflow 스코프가 포함되어 있는지 확인해주세요.',
            ui.ButtonSet.OK
        );
    } else if (code === 404) {
        ui.alert(
            '❌ 레포/워크플로우 없음 (HTTP 404)',
            'GITHUB_OWNER 또는 STATIC_REPO 설정을 확인해주세요.\n' +
            '워크플로우 파일(.github/workflows/update-sheets.yml)이 있는지도 확인하세요.',
            ui.ButtonSet.OK
        );
    } else {
        ui.alert(
            '❌ 배포 실패 (HTTP ' + code + ')',
            response.getContentText(),
            ui.ButtonSet.OK
        );
    }
}
