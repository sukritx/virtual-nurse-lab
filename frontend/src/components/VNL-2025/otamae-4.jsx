import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import OtamaeRecordingComponent from './OtamaeRecordingComponent';

const MAX_ATTEMPTS = 3;

const Otamae4 = () => {
    const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
    const [language, setLanguage] = useState('ja');
    const { token } = useAuth();

    useEffect(() => {
        const fetchLabInfo = async () => {
            try {
                const response = await axios.get('/api/v1/student/otamae/labs', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const lab4 = response.data.labs.find(lab => lab.labInfo.labNumber === 4);
                if (lab4) {
                    setAttemptsLeft(lab4.attemptsLeft);
                }
            } catch (error) {
                console.error('Error fetching lab info:', error);
            }
        };
        fetchLabInfo();
    }, [token]);

    const handleLanguageChange = (event) => {
        setLanguage(event.target.value);
    };

    const content = {
        ja: {
            title: "シナリオ4：母性看護学：退院指導",
            subtitle: "",
            description: "スニサ・ミースックさん、30歳。妊娠・分娩歴：G2P1（経産婦）。特記すべき既往なし、実母に糖尿病。産後4日目。妊娠40週3日で経腟にて女児を出産（出生体重3,350g、新生児低血糖なし、健康状態良好）。\n妊娠中期に妊娠糖尿病（GDM）と診断され、食事療法のみで良好に管理された。妊娠前体重65kg、身長160cm（BMI 25.4）、分娩時体重83kg（増加18kg）。分娩後血糖値は正常範囲に回復。\nバイタルサイン（正常範囲）：T 37.2°C・P 82/min・RR 18/min・BP 115/75 mmHg\n子宮底は臍下4横指・硬く収縮良好、悪露は赤褐色・少量、会陰縫合部に腫脹・発赤なし\n軽度の乳房緊満；乳頭は正常で亀裂なし；児の哺乳は良好；母乳育児を希望；乳汁分泌良好\n明日退院予定・2週間健診および1か月健診でフォローアップ\n薬剤：クエン酸第一鉄ナトリウム1錠 1日1回食後・イブプロフェン200mg 頓用（1日最大3錠）",
            questions: [
                "医師が退院指示を出した後、看護学生としてこの患者への退院指導をどのように行いますか？"
            ]
        },
        en: {
            title: "Scenario 4: Maternal Nursing - Discharge Teaching (Postpartum, GDM)",
            subtitle: "",
            description: "Ms. Sunisa Meesuk, 30 years old. Obstetric history G2P1 (multipara). No medical history of note; her mother has diabetes. She is on postpartum day 4: at 40 weeks 3 days she gave birth vaginally to a female infant (birth weight 3,350 g; no neonatal hypoglycemia; infant in good health).\nDuring pregnancy she was diagnosed with gestational diabetes mellitus (GDM) in the second trimester, well controlled with diet alone. Pre-pregnancy weight 65 kg, height 160 cm (BMI 25.4); weight at delivery 83 kg (gain 18 kg). Postpartum blood glucose has returned to normal.\nVital signs (WNL): T 37.2°C · P 82/min · RR 18/min · BP 115/75 mmHg\nFundus 4 fingerbreadths below umbilicus, firm · lochia reddish-brown, scant · episiotomy no swelling/redness\nMild breast engorgement; nipples normal, no fissures; infant feeding well; wishes to breastfeed; milk secretion good\nDischarge tomorrow · follow-up at 2-week and 1-month checkups\nMedications: sodium ferrous citrate 1 tab once daily after food · ibuprofen 200 mg PRN, max 3 tabs/day",
            questions: [
                "After the physician has issued the discharge order, how would you, as a nursing student, provide discharge teaching for this patient?"
            ]
        }
    }[language];

    return (
        <OtamaeRecordingComponent
            labNumber={4}
            title={content.title}
            subtitle={content.subtitle}
            description={content.description}
            questions={content.questions}
            videoSrc="/otamae/Scenario_4_Postpartum_GDM.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Otamae4;
