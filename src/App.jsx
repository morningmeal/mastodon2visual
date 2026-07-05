import { useState, useEffect } from 'react'
import './App.css' // 📌 [교정] App.css에서 현재 파일명인 App_4.css로 매핑 경로 수복

function App() {
  // --- 상태 관리 ---
  const [token, setToken] = useState('')
  const [url, setUrl] = useState('')
  const [script, setScript] = useState([])
  const [loading, setLoading] = useState(false)
  const [bgGallery, setBgGallery] = useState([])
  
  // 필터링 관련 상태
  const [filterType, setFilterType] = useState('all') 
  const [filterBgUrl, setFilterBgUrl] = useState('')   

  // 플레이어 및 편집 모드 상태
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentSceneIdx, setCurrentSceneIdx] = useState(0)
  
  // 좌우 고정 캐릭터 상태
  const [leftCharacter, setLeftCharacter] = useState({ name: '', avatar: '' })
  const [rightCharacter, setRightCharacter] = useState({ name: '', avatar: '' })

  // 📌 지정 코드 컬러 팔레트 매핑 유지
  const colors = {
    mainBlue: '#235789',
    pointYellow: '#F1D302',
    uiNeutral: '#eeeeee'
  }

  // 초기 로드 시 캐시 데이터 복원
  useEffect(() => {
    const savedToken = localStorage.getItem('masto_token')
    if (savedToken) setToken(savedToken)

    const savedScript = localStorage.getItem('masto_reel_script')
    if (savedScript) setScript(JSON.parse(savedScript))

    const savedGallery = localStorage.getItem('masto_reel_gallery')
    if (savedGallery) setBgGallery(JSON.parse(savedGallery))

    const savedLeft = localStorage.getItem('masto_reel_left_char')
    if (savedLeft) setLeftCharacter(JSON.parse(savedLeft))

    const savedRight = localStorage.getItem('masto_reel_right_char')
    if (savedRight) setRightCharacter(JSON.parse(savedRight))
  }, [])

  // 데이터 변경 시 로컬스토리지에 자동 저장 (캐시 기능)
  useEffect(() => {
    if (script.length > 0) {
      localStorage.setItem('masto_reel_script', JSON.stringify(script))
    }
  }, [script])

  useEffect(() => {
    if (bgGallery.length > 0) {
      localStorage.setItem('masto_reel_gallery', JSON.stringify(bgGallery))
    }
  }, [bgGallery])

  useEffect(() => {
    if (leftCharacter.name) {
      localStorage.setItem('masto_reel_left_char', JSON.stringify(leftCharacter))
    }
  }, [leftCharacter])

  useEffect(() => {
    if (rightCharacter.name) {
      localStorage.setItem('masto_reel_right_char', JSON.stringify(rightCharacter))
    }
  }, [rightCharacter])

  function parseMastodonUrl(inputUrl) {
    try {
      const parsed = new URL(inputUrl)
      const pathParts = parsed.pathname.split('/').filter(Boolean)
      const tootId = pathParts[pathParts.length - 1]
      return { domain: parsed.origin, tootId }
    } catch (e) { return null }
  }

  function decodeHtmlEntities(text) {
    const textArea = document.createElement('textarea')
    textArea.innerHTML = text
    return textArea.value
  }

  // 이미지 URL을 CORS 제약이 없는 base64 스트링으로 변환하는 엔진
  async function convertUrlToBase64(imageUrl, token) {
    if (!imageUrl) return '';
    try {
      const res = await fetch(imageUrl, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.error('CORS 이미지 바이너리 변환 실패', e);
      return imageUrl; 
    }
  }

  async function handleFetchThread() {
    if (!token || !url) {
      alert('토큰과 URL을 모두 입력해주세요!')
      return
    }

    setLoading(true)
    localStorage.setItem('masto_token', token)

    const info = parseMastodonUrl(url)
    if (!info) {
      alert('올바른 마스토돈 URL 형식이 아닙니다.')
      setLoading(false)
      return
    }

    try {
      const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      const secondTootResponse = await fetch(`${info.domain}/api/v1/statuses/${info.tootId}`, { headers })
      const secondToot = await secondTootResponse.json()

      const contextResponse = await fetch(`${info.domain}/api/v1/statuses/${info.tootId}/context`, { headers })
      const contextData = await contextResponse.json()
      
      if (!contextData.ancestors || contextData.ancestors.length === 0) {
        alert('입력하신 URL은 상위 첫 툿이 없는 독립된 글입니다. 대화가 시작된 두 번째 툿 링크를 넣어주세요!')
        setLoading(false)
        return
      }
      const firstToot = contextData.ancestors[0]

      const leftName = firstToot.account.display_name || firstToot.account.username
      const rightName = secondToot.account.display_name || secondToot.account.username
      
      const leftAvatarBase64 = await convertUrlToBase64(firstToot.account.avatar, token);
      const rightAvatarBase64 = await convertUrlToBase64(secondToot.account.avatar, token);

      setLeftCharacter({ name: leftName, avatar: leftAvatarBase64 })
      setRightCharacter({ name: rightName, avatar: rightAvatarBase64 })

      const allTootsMap = new Map()
      allTootsMap.set(firstToot.id, firstToot)
      allTootsMap.set(secondToot.id, secondToot)
      contextData.ancestors.forEach(toot => allTootsMap.set(toot.id, toot))
      contextData.descendants.forEach(toot => allTootsMap.set(toot.id, toot))

      const validSpeakers = [firstToot.account.id, secondToot.account.id]
      const descendantsFiltered = contextData.descendants.filter(toot => validSpeakers.includes(toot.account.id))
      
      let targetEndToot = descendantsFiltered.length > 0 ? descendantsFiltered[descendantsFiltered.length - 1] : secondToot

      const exactChain = []
      let currentTrack = targetEndToot

      while (currentTrack) {
        exactChain.unshift(currentTrack)
        if (currentTrack.id === firstToot.id) { break }
        currentTrack = allTootsMap.get(currentTrack.in_reply_to_id)
      }

      const thread = exactChain.length > 0 && exactChain[0].id === firstToot.id ? exactChain : [firstToot, secondToot]

      const tempGallery = []
      let globalId = 1
      const parsedScript = []

      for (const [tIdx, toot] of thread.entries()) {
        const name = toot.account.display_name || toot.account.username
        let rawText = toot.content.replace(/<[^>]*>/g, '').trim()
        rawText = decodeHtmlEntities(rawText)
        rawText = rawText.replace(/@[a-zA-Z0-9_]+(@[a-zA-Z0-9_.-]+)?/g, '').trim()

        const tootMediaUrls = toot.media_attachments.map(m => m.url)
        
        const base64MediaUrls = [];
        for (const [mIdx, mUrl] of tootMediaUrls.entries()) {
          const mBase64 = await convertUrlToBase64(mUrl, token);
          base64MediaUrls.push(mBase64);
          tempGallery.push({
            id: `toot-${toot.id}-${mIdx}`,
            label: `툿 #${tIdx + 1} 사진 (${mIdx + 1})`,
            url: mBase64
          })
        }

        const currentAuthorAvatar = toot.account.id === firstToot.account.id ? leftAvatarBase64 : rightAvatarBase64;
        const parts = rawText.split(/(\([^)]+\))/g).map(p => p.trim()).filter(Boolean)

        parts.forEach((partText) => {
          const isAction = partText.startsWith('(') && partText.endsWith(')')
          parsedScript.push({
            id: globalId++,
            author: name,
            avatar: currentAuthorAvatar, 
            text: partText,
            isAction: isAction,
            customBg: base64MediaUrls.length > 0 ? base64MediaUrls[0] : '',
            bgFocus: 'center',
            media: base64MediaUrls
          })
        })
      }

      setBgGallery(tempGallery)
      setScript(parsedScript)
      setFilterType('all')
    } catch (error) {
      console.error(error)
      alert('데이터를 가져오는데 실패했습니다.')
    } finally { setLoading(false) }
  }

  const handleTextChange = (originalId, newText) => {
    const updated = script.map(scene => scene.id === originalId ? { ...scene, text: newText } : scene)
    setScript(updated)
  }

  const handleMetaChange = (originalId, key, value) => {
    const updated = script.map(scene => scene.id === originalId ? { ...scene, [key]: value } : scene)
    setScript(updated)
  }

  const mergeWithNext = (currentId) => {
    const currentIndex = script.findIndex(scene => scene.id === currentId)
    if (currentIndex === -1 || currentIndex >= script.length - 1) return
    
    const updated = [...script]
    const current = updated[currentIndex]
    const next = updated[currentIndex + 1]
    
    current.text = `${current.text} \n ${next.text}`
    current.media = [...current.media, ...next.media]
    
    updated.splice(currentIndex + 1, 1)
    setScript(updated)
  }

  const splitScene = (currentId, caretPosition) => {
    const currentIndex = script.findIndex(scene => scene.id === currentId)
    if (currentIndex === -1) return

    const target = script[currentIndex]
    const textBefore = target.text.substring(0, caretPosition).trim()
    const textAfter = target.text.substring(caretPosition).trim()

    if (!textBefore || !textAfter) {
      alert('글 중간에 커서를 두고 분할을 눌러주세요!')
      return
    }

    const updated = [...script]
    updated[currentIndex].text = textBefore

    const newScene = {
      ...target,
      id: Date.now(),
      text: textAfter,
      media: []
    }

    updated.splice(currentIndex + 1, 0, newScene)
    setScript(updated)
  }

  const deleteScene = (currentId) => {
    const currentIndex = script.findIndex(scene => scene.id === currentId)
    if (currentIndex === -1) return
    if (!confirm(`${currentIndex + 1}번째 장면을 완전히 삭제하시겠습니까?`)) return
    
    const updated = [...script]
    updated.splice(currentIndex, 1)
    setScript(updated)
  }

  const handleLocalLocalFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const localUrl = URL.createObjectURL(file)
    const newId = `local-${Date.now()}`
    
    setBgGallery([...bgGallery, {
      id: newId,
      label: `내부 파일: ${file.name}`,
      url: localUrl
    }])
  }

  const addCustomBgUrlToGallery = async () => {
    const customUrl = prompt('추가할 외부 이미지 웹 URL을 입력하세요:')
    if (!customUrl) return
    setLoading(true);
    const securedBase64 = await convertUrlToBase64(customUrl, null);
    const newId = `custom-${Date.now()}`
    setBgGallery([...bgGallery, { id: newId, label: `외부 이미지 (${bgGallery.length + 1})`, url: securedBase64 }]);
    setLoading(false);
  }

  const deleteBgFromGallery = (id, targetUrl) => {
    if (!confirm('이 이미지를 갤러리 라이브러리에서 완전히 지우시겠습니까?\n(해당 배경을 쓰던 씬들은 배경 없는 상태로 전환됩니다)')) return
    
    const filteredGallery = bgGallery.filter(bg => bg.id !== id)
    setBgGallery(filteredGallery)
    localStorage.setItem('masto_reel_gallery', JSON.stringify(filteredGallery))

    const updatedScript = script.map(scene => {
      if (scene.customBg === targetUrl) {
        return { ...scene, customBg: '' }
      }
      return scene
    })
    setScript(updatedScript)
    
    if (filterBgUrl === targetUrl) {
      setFilterBgUrl('')
      setFilterType('all')
    }
  }

  const clearCacheData = () => {
    if (!confirm('현재 편집 중인 모든 대본과 등록된 배경 이미지 캐시를 삭제하고 초기화하시겠습니까?')) return
    localStorage.removeItem('masto_reel_script')
    localStorage.removeItem('masto_reel_gallery')
    localStorage.removeItem('masto_reel_left_char')
    localStorage.removeItem('masto_reel_right_char')
    setScript([])
    setBgGallery([])
    setLeftCharacter({ name: '', avatar: '' })
    setRightCharacter({ name: '', avatar: '' })
    setFilterType('all')
    alert('초기화되었습니다.')
  }

  const handleExportToPDF = () => {
    window.print();
  };

  const handleExportSceneToPNG = async (sceneObj, originalIndex) => {
    // 💡 화면 캡처 중 상태 변화가 화면에 반영될 미세한 시간을 확보하기 위한 헬퍼
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // 현재 플레이어 상태 백업
    const prevPlaying = isPlaying;
    const prevIdx = currentSceneIdx;

    try {
      // 1. 스크린샷을 찍기 위해 상영관(Player) 모드를 강제로 켜고 해당 장면으로 타깃팅합니다.
      // (화면에 그려진 상태 그대로 픽셀을 따기 위함)
      setIsPlaying(true);
      setCurrentSceneIdx(originalIndex);
      
      // 화면이 플레이어 UI로 완전히 전환되고 이미지들이 렌더링될 때까지 100ms 대기
      await sleep(100);

      // 2. 브라우저 내장 화면 캡처 팝업 트리거
      // ⚠️ [안내] 팝업창이 뜨면 반드시 "현재 탭" 또는 "해당 웹 화면"을 선택하고 [공유]를 눌러주셔야 합니다.
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "browser", // 브라우저 탭 선택 유도
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      // 3. 캡처된 비디오 스트림을 가상 비디오 엘리먼트에 매핑
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;

      // 비디오 데이터가 들어올 때까지 대기
      await new Promise((resolve) => {
        video.onloadedmetadata = () => resolve();
      });
      await sleep(50); // 첫 프레임이 깨끗하게 잡히도록 미세 대기

      // 4. 가상 캔버스에 캡처된 픽셀 그대로 도장 찍기
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // 5. 사용이 끝난 스트림 트랙 즉시 종료 (상단 화면 공유 바 제거)
      stream.getTracks().forEach(track => track.stop());

      // 6. 100% 안전한 로컬 자산이 된 캔버스로부터 PNG 파일 추출 및 다운로드
      const link = document.createElement('a');
      link.download = `MastoReel_Screenshot_Scene_${originalIndex + 1}_${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();

    } catch (err) {
      console.error('스크린샷 캡처 도중 오류 또는 취소됨:', err);
      // 사용자가 팝업창에서 취소를 누른 경우 안내
      if (err.name === 'NotAllowedError') {
        alert('화면 캡처 권한이 거부되었거나 취소되었습니다.');
      } else {
        alert('PNG 스크린샷 생성에 실패했습니다.');
      }
    } finally {
      // 7. [롤백] 스크린샷 작업이 끝나면 원래 사용자가 보고 있던 화면 상태로 완벽하게 되돌려놓습니다.
      setIsPlaying(prevPlaying);
      setCurrentSceneIdx(prevIdx);
    }
  };


  const nextScene = () => {
    if (currentSceneIdx < script.length - 1) {
      setCurrentSceneIdx(currentSceneIdx + 1)
    } else {
      alert('마지막 슬라이드 입니다.')
      setIsPlaying(false)
    }
  }

  const filteredScript = script.map((scene, originalIndex) => ({
    ...scene,
    originalIndex
  })).filter(scene => {
    if (filterType === 'warning') {
      return scene.text.length >= 150
    }
    if (filterType === 'background') {
      return scene.customBg === filterBgUrl
    }
    return true
  })

  // 📌 --- [복원] 플레이어 극장 스크린 실시간 상영관 렌더링 구역 ---
  if (isPlaying && script.length > 0) {
    const scene = script[currentSceneIdx]
    const bgImage = scene.customBg
    const isLeftActive = scene.author === leftCharacter.name

    return (
      <div className="full-player-mask" onClick={nextScene}>
        {bgImage && (
          <img src={bgImage} alt="background" className="player-background-canvas" style={{ objectPosition: scene.bgFocus }} />
        )}

        <div className="player-top-header-bar" style={{ width: '85%', maxWidth: '900px' }}>
          <button 
            className="inner-action-btn inner-btn-delete" 
            onClick={(e) => { e.stopPropagation(); setIsPlaying(false) }}
          >
            ✕
          </button>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontWeight: '700', fontSize: '13px', backgroundColor: 'rgba(0,0,0,0.4)', padding: '4px 10px', borderRadius: '20px', display: 'inline-flex', alignItems: 'center' }}>
            {currentSceneIdx + 1} / {script.length}
          </span>
        </div>

        <div className="player-actor-stage">
          <div className="actor-profile-pillar">
            <img src={leftCharacter.avatar} alt="left" style={{ border: isLeftActive && !scene.isAction ? '4px solid #ffffff' : '4px solid rgba(255,255,255,0.04)', filter: isLeftActive && !scene.isAction ? 'brightness(1) scale(1.04)' : 'brightness(0.35) scale(0.96)' }} />
            <div className="actor-profile-name-tag" style={{ opacity: isLeftActive ? 1 : 0.4 }}>{leftCharacter.name}</div>
          </div>
          <div className="actor-profile-pillar">
            <img src={rightCharacter.avatar} alt="right" style={{ border: !isLeftActive && !scene.isAction ? '4px solid #ffffff' : '4px solid rgba(255,255,255,0.04)', filter: !isLeftActive && !scene.isAction ? 'brightness(1) scale(1.04)' : 'brightness(0.35) scale(0.96)' }} />
            <div className="actor-profile-name-tag" style={{ opacity: !isLeftActive ? 1 : 0.4 }}>{rightCharacter.name}</div>
          </div>
        </div>

        <div className="vn-dialogue-base-container" onClick={(e) => e.stopPropagation()}>
          <div className="vn-speaker-title-area">
            <span className="vn-speaker-text" style={{ color: scene.isAction ? '#94a3b8' : '#ffffff' }}>{scene.author}</span>
          </div>
          
          <p className="vn-dialogue-main-paragraph" style={{ fontStyle: scene.isAction ? 'italic' : 'normal', color: scene.isAction ? '#cbd5e1' : '#ffffff' }} onClick={nextScene}>
            {scene.text}
          </p>
          
          <div className="compact-vn-meta-row">
            <span>{scene.isAction ? 'ACTION' : 'DIALOGUE'}</span>
            {currentSceneIdx > 0 && (
              <button className="inner-action-btn inner-btn-header-tool" onClick={(e) => { e.stopPropagation(); setCurrentSceneIdx(currentSceneIdx - 1) }}>이전</button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // --- 메인 작업 데스크 스크린 렌더링 구역 ---
  return (
    <div className="app-container">
      <div className="workspace-wrapper">
        
        {/* 상단 통제 대시보드 카드 */}
        <div className="dashboard-card no-print" style={{ borderTop: `5px solid ${colors.mainBlue}` }}>
          <h1 className="dashboard-title" style={{ color: colors.mainBlue }}>마스토돈 to 비주얼노벨</h1>
          <p className="dashboard-desc">URL로 2인 대화 슬라이드 생성</p>
          
          <div className="input-grid">
            <div className="input-field-box">
              <label className="input-label">마스토돈 액세스 토큰</label>
              <input type="password" value={token} onChange={(e) => setToken(e.target.value)} className="form-input" placeholder="인증 토큰 입력" />
            </div>
            <div className="input-field-box">
              <label className="input-label">두 번째 툿 URL 입력</label>
              <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} className="form-input" placeholder="https://..." />
            </div>
          </div>

          <div className="btn-group-row">
            <button onClick={handleFetchThread} disabled={loading} className="btn-base" style={{ backgroundColor: colors.mainBlue, color: '#fff' }}>
              {loading ? '분석 중...' : '데이터 수집'}
            </button>
            {script.length > 0 && (
              <>
                <button onClick={() => startPlayerFromId(script[0].id)} className="btn-base" style={{ backgroundColor: colors.pointYellow, color: '#1e293b' }}>슬라이드 보기</button>
                <button onClick={handleExportToPDF} className="btn-base btn-emerald-pdf">PDF 저장</button>
                
                <label className="btn-base btn-file-upload-label" style={{ backgroundColor: '#ffffff', color: '#475569', border: '1px solid #cbd5e1', cursor: 'pointer' }}>
                   배경 파일 추가
                  <input type="file" accept="image/*" onChange={handleLocalLocalFileUpload} style={{ display: 'none' }} />
                </label>
                <button onClick={addCustomBgUrlToGallery} className="btn-base btn-outline-gray">배경 URL 추가</button>
                <button onClick={clearCacheData} className="btn-base btn-reset-red">초기화</button>
              </>
            )}
          </div>
        </div>

        {/* 독립된 갤러리 라이브러리 관리 섹션 */}
        {script.length > 0 && bgGallery.length > 0 && (
          <div className="dashboard-card no-print" style={{ borderTop: `4px solid ${colors.mainBlue}`, padding: '20px' }}>
            <h3 style={{ margin: '0 0 14px 0', fontSize: '14px', color: colors.mainBlue, fontWeight: '800' }}>배경 갤러리</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px' }}>
              {bgGallery.map((bg) => (
                <div key={bg.id} style={{ position: 'relative', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#000', height: '75px' }}>
                  <img src={bg.url} alt="gallery" style={{ width: '100%', height: '100%', objectFit: 'cover' }} title={bg.label} />
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(15, 23, 42, 0.85)', color: '#fff', fontSize: '10px', padding: '4px 6px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {bg.label}
                  </div>
                  <button 
                    onClick={() => deleteBgFromGallery(bg.id, bg.url)} 
                    style={{ position: 'absolute', top: '4px', right: '4px', backgroundColor: 'rgba(239,68,68,0.9)', border: 'none', borderRadius: '4px', width: '18px', height: '16px', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold' }}
                    title="영구 삭제"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* main 에디터 레이아웃 */}
        {script.length > 0 && (
          <div>
            <div className="dashboard-card no-print" style={{ padding: '14px 20px', marginBottom: '20px', borderTop: 'none', borderLeft: `4px solid ${filterType !== 'all' ? '#10b981' : '#cbd5e1'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', fontSize: '13px' }}>
                <span style={{ fontWeight: '800', color: '#475569' }}>씬 필터:</span>
                
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: filterType === 'all' ? '700' : 'normal' }}>
                  <input type="radio" name="scriptFilter" checked={filterType === 'all'} onChange={() => setFilterType('all')} />
                  전체 보기 ({script.length})
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#d97706', fontWeight: filterType === 'warning' ? '700' : 'normal' }}>
                  <input type="radio" name="scriptFilter" checked={filterType === 'warning'} onChange={() => setFilterType('warning')} />
                     분량 경고 ({script.filter(s => s.text.length >= 150).length})
                </label>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: filterType === 'background' ? '700' : 'normal' }}>
                    <input type="radio" name="scriptFilter" checked={filterType === 'background'} onChange={() => { setFilterType('background'); if(!filterBgUrl && bgGallery.length > 0) setFilterBgUrl(bgGallery[0].url); }} />
                    특정 배경
                  </label>
                  
                  {filterType === 'background' && (
                    <select 
                      value={filterBgUrl} 
                      onChange={(e) => setFilterBgUrl(e.target.value)}
                      style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', maxWidth: '220px' }}
                    >
                      <option value="">기본 화면 (배경 없음)</option>
                      {bgGallery.map(bg => (
                        <option key={bg.id} value={bg.url}>{bg.label}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>

            <div className="section-title-bar" style={{ marginBottom: '14px' }}>
              <h2 className="section-title">
                스크립트 편집 {filterType !== 'all' && <span style={{ color: '#10b981' }}>(필터 적용 중: {filteredScript.length}개 노출)</span>}
              </h2>
              <span className="section-status">총 {script.length}개 장면</span>
            </div>
            
            {filteredScript.map((scene) => {
              const lengthCheck = scene.text.length >= 150;
              const currentIdx = scene.originalIndex;

              return (
                <div key={scene.id} className="editor-card" style={{ borderLeft: `5px solid ${colors.mainBlue}` }}>
                  {lengthCheck && (
                    <div className="warning-length-banner">
                      이 씬의 자막 분량이 다소 깁니다. 더 쾌적한 화면 연출을 위해 상단의 [커서기준분할] 단추로 씬을 쪼개는 것을 추천합니다.
                    </div>
                  )}

                  <div className="card-header-row">
                    <img src={scene.avatar} alt="author-avatar" className="meta-avatar" />
                    <span className="meta-author">{scene.author}</span>
                    <span className="meta-scene-badge" style={{ color: colors.mainBlue }}>SCENE {currentIdx + 1}</span>
                    
                    <button onClick={() => handleMetaChange(scene.id, 'isAction', !scene.isAction)} className={`inner-action-btn ${scene.isAction ? 'inner-btn-toggle-active' : 'inner-btn-toggle-inactive'}`}>
                      {scene.isAction ? '지문' : '대사'}
                    </button>
                    <button onClick={() => deleteScene(scene.id)} className="inner-action-btn inner-btn-delete">삭제</button>
                    <button onClick={() => startPlayerFromId(scene.id)} className="inner-action-btn inner-btn-preview">미리보기</button>

                    <button 
                      onClick={() => handleExportSceneToPNG(scene, currentIdx)} 
                      className="inner-action-btn" 
                      style={{ backgroundColor: '#eff6ff', color: '#2563eb' }}
                    >
                      PNG 저장
                    </button>   
              
                    <div className="header-tools-right">
                      <button onClick={() => { const textarea = document.getElementById(`text-${scene.id}`); splitScene(scene.id, textarea.selectionStart); }} className="inner-action-btn inner-btn-header-tool">커서기준분할</button>
                      {currentIdx < script.length - 1 && ( 
                        <button onClick={() => mergeWithNext(scene.id)} className="inner-action-btn inner-btn-header-tool">아래와 합치기</button> 
                      )}
                    </div>
                  </div>

                  <div className="split-flex-container">
                    <div className="left-pane-textbox">
                      <textarea 
                        id={`text-${scene.id}`} 
                        value={scene.text} 
                        onChange={(e) => handleTextChange(scene.id, e.target.value)} 
                        className="main-textarea" 
                      />
                    </div>

                    <div className="right-pane-configurator">
                      <label className="config-block-label">
                        <span>배경 화면</span>
                        <select 
                          value={scene.customBg} 
                          onChange={(e) => handleMetaChange(scene.id, 'customBg', e.target.value)}
                          className="config-select-menu"
                        >
                          <option value="">배경 없음</option>
                          {bgGallery.map((bg) => (
                            <option key={bg.id} value={bg.url}>{bg.label}</option>
                          ))}
                        </select>
                      </label>

                      {scene.customBg && (
                        <div className="asset-preview-row">
                          <div className="asset-mini-thumbnail">
                            <img 
                              src={scene.customBg} 
                              alt="thumbnail" 
                              style={{ objectPosition: scene.bgFocus }} 
                            />
                          </div>

                          <div className="focus-radio-group-box">
                            <span style={{ marginBottom: '2px' }}>초점 조절</span>
                            <div className="radio-inline-labels">
                              {['top', 'center', 'bottom'].map((pos) => (
                                <label key={pos}>
                                  <input type="radio" name={`focus-${scene.id}`} value={pos} checked={scene.bgFocus === pos} onChange={() => handleMetaChange(scene.id, 'bgFocus', pos)} />
                                  {pos === 'top' ? '위' : pos === 'center' ? '중' : '아래'}
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              )
            })}

            {filteredScript.length === 0 && (
              <div className="editor-card" style={{ textAlign: 'center', padding: '30px', color: '#64748b', fontSize: '13px', borderLeftColor: '#ef4444' }}>
                선택한 필터 조건에 부합하는 장면이 존재하지 않습니다. 상단 필터 바에서 분류를 변경해 보세요.
              </div>
            )}
          </div>
        )}
      </div>

      {/* 📌 백그라운드 전체 슬라이드 PDF 빌드 존 (화면엔 안 보임) */}
      <div className="pdf-print-zone">
        {script.map((scene, idx) => {
          const bgImage = scene.customBg;
          const isLeftActive = scene.author === leftCharacter.name;
          
          return (
            <div key={`pdf-slide-node-${scene.id}`} className="pdf-slide-page">
              {bgImage && (
                <img 
                  src={bgImage} 
                  alt="bg" 
                  className="player-background-canvas" 
                  style={{ objectPosition: scene.bgFocus }} 
                />
              )}

              <div style={{ position: 'absolute', top: '30px', right: '40px', color: 'rgba(255,255,255,0.5)', fontWeight: 'bold', fontSize: '14px', zIndex: 10 }}>
                SLIDE {idx + 1} / {script.length}
              </div>

              <div className="player-actor-stage">
                <div className="actor-profile-pillar">
                  <img 
                    src={leftCharacter.avatar} 
                    alt="left" 
                    style={{ 
                      border: isLeftActive && !scene.isAction ? '4px solid #ffffff' : '4px solid rgba(255,255,255,0.04)', 
                      filter: isLeftActive && !scene.isAction ? 'brightness(1) scale(1.04)' : 'brightness(0.35) scale(0.96)' 
                    }} 
                  />
                  <div className="actor-profile-name-tag" style={{ opacity: isLeftActive ? 1 : 0.4 }}>{leftCharacter.name}</div>
                </div>
                <div className="actor-profile-pillar">
                  <img 
                    src={rightCharacter.avatar} 
                    alt="right" 
                    style={{ 
                      border: !isLeftActive && !scene.isAction ? '4px solid #ffffff' : '4px solid rgba(255,255,255,0.04)', 
                      filter: !isLeftActive && !scene.isAction ? 'brightness(1) scale(1.04)' : 'brightness(0.35) scale(0.96)' 
                    }} 
                  />
                  <div className="actor-profile-name-tag" style={{ opacity: !isLeftActive ? 1 : 0.4 }}>{rightCharacter.name}</div>
                </div>
              </div>

              <div className="vn-dialogue-base-container">
                <div className="vn-speaker-title-area">
                  <span className="vn-speaker-text" style={{ color: scene.isAction ? '#94a3b8' : '#ffffff' }}>{scene.author}</span>
                </div>
                
                <p className="vn-dialogue-main-paragraph" style={{ fontStyle: scene.isAction ? 'italic' : 'normal', color: scene.isAction ? '#cbd5e1' : '#ffffff' }}>
                  {scene.text}
                </p>
                
                <div className="compact-vn-meta-row">
                  <span>{scene.isAction ? 'ACTION' : 'DIALOGUE'}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default App