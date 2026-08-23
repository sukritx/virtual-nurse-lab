import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import FundamentalRecordingComponent from './FundamentalRecordingComponent';

const MAX_ATTEMPTS = 3;

const Fundamental1 = () => {
    const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
    const [language, setLanguage] = useState('th');
    const { token } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        const fetchLabInfo = async () => {
            try {
                const response = await axios.get('/api/v1/student/fundamental/labs', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const lab1 = response.data.labs.find(lab => lab.labInfo.labNumber === 1);
                if (lab1) {
                    setAttemptsLeft(lab1.attemptsLeft);
                }
            } catch (error) {
                console.error('Error fetching lab info:', error);
            }
        };
        fetchLabInfo();
    }, [token]);

    const handleLanguageChange = (event) => {
        const newLanguage = event.target.value;
        setLanguage(newLanguage);

        if (newLanguage === 'en') {
            navigate('/student/fundamental/1en');
        }
    };

    return (
        <FundamentalRecordingComponent
            labNumber={1}
            title="สถานการณ์ที่ 1: การพยาบาลผู้ป่วยที่คาสายสวนปัสสาวะ"
            subtitle=""
            description="ผู้ป่วยสูงอายุ 68 ปี หลังผ่าตัดช่องท้องวันที่ 2 มีสายสวนปัสสาวะ Foley catheter เบอร์ 14 Fr ต่อกับถุงระบายปัสสาวะแบบปิด แผนการรักษา: คาสายสวนปัสสาวะไว้ บันทึกปริมาณปัสสาวะทุก 8 ชั่วโมง ในระหว่างเวรเช้า นักศึกษาพยาบาลสังเกตว่าถุงรองรับปัสสาวะวางอยู่บนเตียงข้างผู้ป่วยในระดับเดียวกับกระเพาะปัสสาวะ และสายระบายปัสสาวะมีการหักพับงอ ปัสสาวะในถุงมีสีเหลืองอ่อนใส ปริมาณ 250 mL"
            questions={[
                "จากวิดีโอ จงระบุสิ่งที่ไม่ถูกต้องของการจัดวางระบบระบายปัสสาวะในขณะนี้ พร้อมอธิบายวิธีแก้ไขและเหตุผลประกอบ",
                "จงอธิบายการพยาบาลที่จำเป็นในเวรของท่าน เพื่อป้องกัน CAUTI และดูแลสายสวนปัสสาวะของผู้ป่วยรายนี้อย่างปลอดภัย"
            ]}
            videoSrc="/fundamental/1.%20TH%20Retained%20Urinary%20Catheter.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Fundamental1;
