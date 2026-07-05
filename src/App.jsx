import { useState, useEffect } from 'react'
import './App.css'

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

  // 📍 [편의성 추가] 이전 스크롤 위치 및 상단 이동 버튼 노출 상태
  const [scrollPosition, setScrollPosition] = useState(0)
  const [showTopBtn, setShowTopBtn] = useState(false)
  
  // 좌우 고정 캐릭터 상태
  const [leftCharacter, setLeftCharacter] = useState({ name: '', avatar: '' })
  const [rightCharacter, setRightCharacter] = useState({ name: '', avatar: '' })

  // 📌 통합 자산 빌드 장전 완료 여부 및 제어 모달 상태
  const [isPngReady, setIsPngReady] = useState(false)
  const [showPrepModal, setShowPrepModal] = useState(false)

  // 지정 코드 컬러 팔레트 매핑 유지[cite: 4]
  const colors = {
    mainBlue: '#235789',
    pointYellow: '#F1D302',
    uiNeutral: '#eeeeee'
  }

  // 초기 로드 시 캐시 데이터 복원[cite: 4]
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

  // 📌 [교정] 로컬스토리지 용량 초과(QuotaExceededError) 방지 예외 처리 적용[cite: 4]
  useEffect(() => {
    if (script.length > 0) {
      try {
        localStorage.setItem('masto_reel_script', JSON.stringify(script))
      } catch (e) {
        // 용량이 꽉 차서 저장이 실패하더라도, 앱이 터지지 않고 메모리 상에서 편집이 유지되도록 우회합니다.
        console.warn('로컬스토리지 용량 초과로 자동 저장이 스킵되었습니다. 편집은 정상 유지됩니다.');
      }
    }
  }, [script])

  useEffect(() => {
    if (bgGallery.length > 0) {
      try {
        localStorage.setItem('masto_reel_gallery', JSON.stringify(bgGallery))
      } catch (e) {
        console.warn('로컬스토리지 용량 초과로 갤러리 자동 저장이 스킵되었습니다.');
      }
    }
  }, [bgGallery])

  useEffect(() => {
    if (leftCharacter.name) {
      try {
        localStorage.setItem('masto_reel_left_char', JSON.stringify(leftCharacter))
      } catch (e) {
        console.warn('로컬스토리지 용량 초과로 캐릭터 저장이 스킵되었습니다.');
      }
    }
  }, [leftCharacter])

  useEffect(() => {
    if (rightCharacter.name) {
      try {
        localStorage.setItem('masto_reel_right_char', JSON.stringify(rightCharacter))
      } catch (e) {
        console.warn('로컬스토리지 용량 초과로 캐릭터 저장이 스킵되었습니다.');
      }
    }
  }, [rightCharacter])

  // 📌 전역 자산 무결성 자동 검증 훅 (외부 주소가 단 하나도 없을 때만 PNG 저장 버튼 잠금 해제)[cite: 4]
  useEffect(() => {
    if (script.length === 0) {
      setIsPngReady(false)
      return
    }
    const isLeftExternal = leftCharacter.avatar && leftCharacter.avatar.startsWith('http')
    const isRightExternal = rightCharacter.avatar && rightCharacter.avatar.startsWith('http')
    const hasExternalBg = script.some(scene => scene.customBg && scene.customBg.startsWith('http'))

    if (isLeftExternal || isRightExternal || hasExternalBg) {
      setIsPngReady(false)
    } else {
      setIsPngReady(true)
    }
  }, [script, leftCharacter, rightCharacter])

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
      
      const leftAvatarUrl = firstToot.account.avatar;
      const rightAvatarUrl = secondToot.account.avatar;

      setLeftCharacter({ name: leftName, avatar: leftAvatarUrl })
      setRightCharacter({ name: rightName, avatar: rightAvatarUrl })

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
        
        for (const [mIdx, mUrl] of tootMediaUrls.entries()) {
          tempGallery.push({
            id: `toot-${toot.id}-${mIdx}`,
            label: `툿 #${tIdx + 1} 사진 (${mIdx + 1})`,
            url: mUrl
          })
        }

        const currentAuthorAvatar = toot.account.id === firstToot.account.id ? leftAvatarUrl : rightAvatarUrl;
        const parts = rawText.split(/(\([^)]+\))/g).map(p => p.trim()).filter(Boolean)

        parts.forEach((partText) => {
          const isAction = partText.startsWith('(') && partText.endsWith(')')
          parsedScript.push({
            id: globalId++,
            author: name,
            avatar: currentAuthorAvatar, 
            text: partText,
            isAction: isAction,
            customBg: tootMediaUrls.length > 0 ? tootMediaUrls[0] : '',
            bgFocus: 'center',
            media: tootMediaUrls
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

    const reader = new FileReader()
    reader.onloadend = () => {
      const base64Url = reader.result
      const newId = `local-${Date.now()}`
      setBgGallery([...bgGallery, {
        id: newId,
        label: `내부 파일: ${file.name}`,
        url: base64Url
      }])
    }
    reader.readAsDataURL(file)
  }

  // 가이드 모달 내부 통합 개별 업로드 분기기[cite: 4]
  const handlePrepAssetUpload = (e, type, originalUrl = '') => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onloadend = () => {
      const base64Result = reader.result

      if (type === 'left') {
        setLeftCharacter(prev => ({ ...prev, avatar: base64Result }))
        setScript(prev => prev.map(s => s.author === leftCharacter.name ? { ...s, avatar: base64Result } : s))
      } else if (type === 'right') {
        setRightCharacter(prev => ({ ...prev, avatar: base64Result }))
        setScript(prev => prev.map(s => s.author === rightCharacter.name ? { ...s, avatar: base64Result } : s))
      } else if (type === 'bg' && originalUrl) {
        setScript(prev => prev.map(s => s.customBg === originalUrl ? { ...s, customBg: base64Result } : s))
        setBgGallery(prev => prev.map(g => g.url === originalUrl ? { ...g, url: base64Result, label: `업로드 완료: ${file.name}` } : g))
      }
    }
    reader.readAsDataURL(file)
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
    setIsPngReady(false)
    alert('초기화되었습니다.')
  }

  const handleExportToPDF = () => {
    window.print();
  };

  const handleExportSceneToPNG = async (sceneObj, originalIndex) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');

      const loadImage = (src) => {
        return new Promise((resolve) => {
          if (!src) return resolve(null);
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = src;
        });
      };
      
      const [bgImg, leftAvatar, rightAvatar] = await Promise.all([
        loadImage(sceneObj.customBg),
        loadImage(leftCharacter.avatar),
        loadImage(rightCharacter.avatar)
      ]);

      if (bgImg) {
        const canvasRatio = canvas.width / canvas.height;
        const imgRatio = bgImg.width / bgImg.height;
        let sX = 0, sY = 0, sWidth = bgImg.width, sHeight = bgImg.height;

        if (imgRatio > canvasRatio) {
          sWidth = bgImg.height * canvasRatio;
          sX = (bgImg.width - sWidth) / 2;
        } else {
          sHeight = bgImg.width / canvasRatio;
          if (sceneObj.bgFocus === 'top') sY = 0;
          else if (sceneObj.bgFocus === 'bottom') sY = bgImg.height - sHeight;
          else sY = (bgImg.height - sHeight) / 2;
        }

        ctx.drawImage(bgImg, sX, sY, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(12, 15, 23, 0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = '#0c0f17';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      const isLeftActive = sceneObj.author === leftCharacter.name;
      const avatarSize = 200;
      const avatarY = 220;

      if (leftAvatar) {
        ctx.save();
        const leftX = 150;
        if (!isLeftActive || sceneObj.isAction) {
          ctx.globalAlpha = 0.35;
        }
        ctx.beginPath();
        ctx.arc(leftX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(leftAvatar, leftX, avatarY, avatarSize, avatarSize);
        ctx.restore();

        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px Pretendard, sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;
        ctx.globalAlpha = isLeftActive && !sceneObj.isAction ? 1.0 : 0.4;
        ctx.fillText(leftCharacter.name, leftX + avatarSize / 2, avatarY + avatarSize + 35);
        ctx.restore();
      }

      if (rightAvatar) {
        ctx.save();
        const rightX = canvas.width - 150 - avatarSize;
        if (isLeftActive || sceneObj.isAction) {
          ctx.globalAlpha = 0.35;
        }
        ctx.beginPath();
        ctx.arc(rightX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(rightAvatar, rightX, avatarY, avatarSize, avatarSize);
        ctx.restore();

        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px Pretendard, sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;
        ctx.globalAlpha = !isLeftActive && !sceneObj.isAction ? 1.0 : 0.4;
        ctx.fillText(rightCharacter.name, rightX + avatarSize / 2, avatarY + avatarSize + 35);
        ctx.restore();
      }

// 5. 하단 비주얼노벨 대사창 UI 정교하게 구축 (복원 완료)
      const boxWidth = 1088;
      const boxHeight = 180;
      const boxX = (canvas.width - boxWidth) / 2;
      const boxY = canvas.height - boxHeight - 40;

      ctx.save();
      ctx.fillStyle = 'rgba(18, 24, 38, 0.88)'; // 반투명 짙은 네이비
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(boxX, boxY, boxWidth, boxHeight);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // 6. 화자(Speaker) 이름 텍스트 얹기
      ctx.save();
      ctx.fillStyle = sceneObj.isAction ? '#94a3b8' : '#ffffff';
      ctx.font = 'bold 24px Pretendard, sans-serif';
      ctx.fillText(sceneObj.author, boxX + 40, boxY + 45);
      ctx.restore();

      // 7. 메인 본문 줄바꿈 처리 및 렌더링 (자동 랩핑 엔진)
      ctx.save();
      ctx.fillStyle = sceneObj.isAction ? '#cbd5e1' : '#ffffff';
      ctx.font = sceneObj.isAction ? 'italic 22px Pretendard, sans-serif' : '22px Pretendard, sans-serif';
      
      const maxTextWidth = boxWidth - 80; // 실질적인 글자 허용 가로폭
      const lineHeight = 36;
      let textX = boxX + 40;
      let textY = boxY + 95; // 이름 아래 본문이 시작되는 y축 기준선

      // 우선 사용자가 직접 입력한 엔터(\n)를 파싱합니다.
      const rawLines = sceneObj.text.split('\n');

      rawLines.forEach((rawLine) => {
        let currentLineText = '';
        
        // 한 글자씩 검사하며 가로 제한폭을 넘는지 계산합니다.
        for (let i = 0; i < rawLine.length; i++) {
          const char = rawLine[i];
          const testLine = currentLineText + char;
          const metrics = ctx.measureText(testLine);
          
          if (metrics.width > maxTextWidth && i > 0) {
            // 한계폭을 넘어가면 개행 후 다음 줄로 토스합니다.
            ctx.fillText(currentLineText, textX, textY);
            currentLineText = char;
            textY += lineHeight;
          } else {
            currentLineText = testLine;
          }
        }
        
        // 줄바꿈 계산 후 남은 최후의 잔여 텍스트를 묘사합니다.
        if (currentLineText.length > 0) {
          ctx.fillText(currentLineText, textX, textY);
          textY += lineHeight;
        }
      });
      ctx.restore();

      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.font = 'bold 14px Pretendard, sans-serif';
      ctx.fillText(sceneObj.isAction ? 'ACTION' : 'DIALOGUE', boxX + 40, boxY + boxHeight - 20);
      ctx.textAlign = 'right';
      ctx.fillText(`SCENE ${originalIndex + 1}`, boxX + boxWidth - 40, boxY + boxHeight - 20);
      ctx.restore();

      const link = document.createElement('a');
      link.download = `MastoReel_Scene_${originalIndex + 1}_${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();

    } catch (err) {
      console.error(err);
      alert('PNG 생성 도중 예외가 발생했습니다.');
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

  // 📍 [편의성 추가] 미리보기 진입 시 현재 스크롤 기억 로직 통합
  const startPlayerFromId = (id) => {
    const targetIdx = script.findIndex(s => s.id === id);
    if(targetIdx !== -1) {
      setScrollPosition(window.scrollY); // 진입 직전의 스크롤 위치 기록
      setCurrentSceneIdx(targetIdx);
      setIsPlaying(true);
    }
  }

  // 📍 [편의성 추가] 미리보기 종료 및 스크롤 복원 트리거 핸들러
  const handleClosePlayer = () => {
    setIsPlaying(false);
    // 미리보기 컴포넌트가 닫히고 DOM이 재배치된 직후 원래 스크롤 위치 복원
    setTimeout(() => {
      window.scrollTo(0, scrollPosition);
    }, 10);
  }

  // 📍 [편의성 추가] 맨 위로 부드럽게 스크롤해 주는 애니메이션 핸들러
  const handleScrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
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

  // 상영관 렌더링 구역[cite: 4]
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

  // 메인 작업 데스크[cite: 4]
  return (
    <div className="app-container">
      <div className="workspace-wrapper">
        
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
              {loading ? '분석 중...' : '수집'}
            </button>
            {script.length > 0 && (
              <>
                <button onClick={() => startPlayerFromId(script[0].id)} className="btn-base" style={{ backgroundColor: colors.pointYellow, color: '#1e293b' }}>보기</button>
                <button onClick={handleExportToPDF} className="btn-base btn-emerald-pdf">PDF</button>
                
                <button 
                  onClick={() => setShowPrepModal(true)} 
                  className="btn-base" 
                  style={{ backgroundColor: isPngReady ? '#10b981' : '#a42929', color: '#ffffff' }}
                >
                  {isPngReady ? '준비 완료' : 'PNG 준비'}
                </button>

                <label className="btn-base btn-file-upload-label" style={{ backgroundColor: '#ffffff', color: '#475569', border: '1px solid #cbd5e1', cursor: 'pointer' }}>
                   배경 추가
                  <input type="file" accept="image/*" onChange={handleLocalLocalFileUpload} style={{ display: 'none' }} />
                </label>
                <button onClick={addCustomBgUrlToGallery} className="btn-base btn-outline-gray">배경 URL 추가</button>
                <button onClick={clearCacheData} className="btn-base btn-reset-red">초기화</button>
              </>
            )}
          </div>
        </div>

        {/* 갤러리[cite: 4] */}
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
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 에디터 목록[cite: 4] */}
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
                    <img src={scene.avatar} alt="avatar" className="meta-avatar" style={{ backgroundColor: '#cbd5e1' }} />
                    <span className="meta-author">{scene.author}</span>
                    <span className="meta-scene-badge" style={{ color: colors.mainBlue }}>SCENE {currentIdx + 1}</span>
                    
                    <button onClick={() => handleMetaChange(scene.id, 'isAction', !scene.isAction)} className={`inner-action-btn ${scene.isAction ? 'inner-btn-toggle-active' : 'inner-btn-toggle-inactive'}`}>
                      {scene.isAction ? '지문' : '대사'}
                    </button>
                    <button onClick={() => deleteScene(scene.id)} className="inner-action-btn inner-btn-delete">삭제</button>
                    <button onClick={() => startPlayerFromId(scene.id)} className="inner-action-btn inner-btn-preview">미리보기</button>

                    {isPngReady && (
                      <button 
                        onClick={() => handleExportSceneToPNG(scene, currentIdx)} 
                        className="inner-action-btn" 
                        style={{ backgroundColor: '#eff6ff', color: '#2563eb' }}
                      >
                        PNG 저장
                      </button>   
                    )}
              
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

      {/* 일괄 등록 모달 포털[cite: 4] */}
      {showPrepModal && (
        <div className="modal-overlay-mask" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px' }}>
          <div className="modal-window-box" style={{ background: '#ffffff', maxWidth: '560px', width: '100%', borderRadius: '14px', padding: '24px', boxSizing: 'border-box', maxHeight: '85vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', fontWeight: '800', color: '#1e293b' }}>PNG 준비</h3>
            <p style={{ fontSize: '13px', color: '#475569', lineHeight: '1.6', margin: '0 0 20px 0' }}>
              CORS 오염 방지를 위해 아래 목록의 원본 주소를 클릭하여 저장한 뒤, 컴퓨터에서 파일로 각각 재등록해 주세요. 모든 파일이 등록되면 저장 단추가 활성화됩니다.
            </p>
            
            <div style={{ marginBottom: '20px', paddingBottom: '15px', borderBottom: '1px dashed #cbd5e1' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: '700' }}>프로필 등록</h4>
              <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
                {leftCharacter.name && leftCharacter.avatar.startsWith('http') && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', background: '#f8fafc', padding: '8px', borderRadius: '6px' }}>
                    <span>{leftCharacter.name}</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <a href={leftCharacter.avatar} target="_blank" rel="noreferrer" style={{ background: '#e2e8f0', color: '#1e293b', padding: '4px 8px', borderRadius: '4px', textDecoration: 'none', fontWeight: '600' }}>다운로드</a>
                      <label style={{ background: '#235789', color: '#fff', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}>등록<input type="file" accept="image/*" onChange={(e) => handlePrepAssetUpload(e, 'left')} style={{ display: 'none' }} /></label>
                    </div>
                  </div>
                )}
                {rightCharacter.name && rightCharacter.avatar.startsWith('http') && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', background: '#f8fafc', padding: '8px', borderRadius: '6px' }}>
                    <span>{rightCharacter.name}</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <a href={rightCharacter.avatar} target="_blank" rel="noreferrer" style={{ background: '#e2e8f0', color: '#1e293b', padding: '4px 8px', borderRadius: '4px', textDecoration: 'none', fontWeight: '600' }}>다운로드</a>
                      <label style={{ background: '#235789', color: '#fff', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}>등록<input type="file" accept="image/*" onChange={(e) => handlePrepAssetUpload(e, 'right')} style={{ display: 'none' }} /></label>
                    </div>
                  </div>
                )}
                {(!leftCharacter.avatar?.startsWith('http') && !rightCharacter.avatar?.startsWith('http')) && (
                  <span style={{ fontSize: '12px', color: '#10b981', fontWeight: '700' }}>프로필 준비 완료</span>
                )}
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: '700' }}>배경 등록</h4>
              <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
                {bgGallery.filter(g => g.url.startsWith('http')).map((bg) => (
                  <div key={bg.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', background: '#f8fafc', padding: '8px', borderRadius: '6px' }}>
                    <span style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bg.label}</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <a href={bg.url} target="_blank" rel="noreferrer" style={{ background: '#e2e8f0', color: '#1e293b', padding: '4px 8px', borderRadius: '4px', textDecoration: 'none', fontWeight: '600' }}>다운로드</a>
                      <label style={{ background: '#235789', color: '#fff', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}>등록<input type="file" accept="image/*" onChange={(e) => handlePrepAssetUpload(e, 'bg', bg.url)} style={{ display: 'none' }} /></label>
                    </div>
                  </div>
                ))}
                {bgGallery.filter(g => g.url.startsWith('http')).length === 0 && (
                  <span style={{ fontSize: '12px', color: '#10b981', fontWeight: '700' }}>배경 준비 완료</span>
                )}
              </div>
            </div>

            <div style={{ textAlign: 'right', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
              <button onClick={() => setShowPrepModal(false)} style={{ background: '#cbd5e1', color: '#1e293b', border: 'none', padding: '6px 14px', borderRadius: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '13px' }}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* PDF 빌드 존[cite: 4] */}
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