import React, { useState, useRef, useCallback, useEffect } from 'react';
import { FaVideo, FaStop, FaRedo, FaCheck } from 'react-icons/fa';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';

const MAX_RECORDING_TIME = 180; // 3 minutes in seconds

const VideoRecorder = ({ onRecordingComplete }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [recordedBlob, setRecordedBlob] = useState(null);
    const [timeLeft, setTimeLeft] = useState(MAX_RECORDING_TIME);
    const [error, setError] = useState('');

    const mediaRecorderRef = useRef(null);
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const timerRef = useRef(null);

    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            streamRef.current = stream;
            videoRef.current.srcObject = stream;
            
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            
            const chunks = [];
            mediaRecorder.ondataavailable = (event) => chunks.push(event.data);
            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                setRecordedBlob(blob);
            };
            
            mediaRecorder.start();
            setIsRecording(true);
            setTimeLeft(MAX_RECORDING_TIME);
            
            timerRef.current = setInterval(() => {
                setTimeLeft((prevTime) => {
                    if (prevTime <= 1) {
                        clearInterval(timerRef.current);
                        mediaRecorder.stop();
                        setIsRecording(false);
                        return 0;
                    }
                    return prevTime - 1;
                });
            }, 1000);
        } catch (err) {
            setError('Error accessing camera: ' + err.message);
        }
    }, []);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            clearInterval(timerRef.current);
            setIsRecording(false);
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        }
    }, [isRecording]);

    const resetRecording = useCallback(() => {
        setRecordedBlob(null);
        setTimeLeft(MAX_RECORDING_TIME);
        setError('');
    }, []);

    const useRecording = useCallback(() => {
        if (recordedBlob) {
            onRecordingComplete(recordedBlob);
        }
    }, [recordedBlob, onRecordingComplete]);

    useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
    }, []);

    return (
        <div className="border-2 border-gray-300 rounded-lg p-4">
            <video ref={videoRef} className="w-full mb-4" autoPlay muted />
            <div className="flex justify-between items-center">
                {!isRecording && !recordedBlob && (
                    <button
                        onClick={startRecording}
                        className="bg-red-500 text-white px-4 py-2 rounded-full flex items-center"
                    >
                        <FaVideo className="mr-2" />
                        Start Recording
                    </button>
                )}
                {isRecording && (
                    <button
                        onClick={stopRecording}
                        className="bg-gray-500 text-white px-4 py-2 rounded-full flex items-center"
                    >
                        <FaStop className="mr-2" />
                        Stop Recording
                    </button>
                )}
                {recordedBlob && (
                    <div className="flex space-x-2">
                        <button
                            onClick={resetRecording}
                            className="bg-yellow-500 text-white px-4 py-2 rounded-full flex items-center"
                        >
                            <FaRedo className="mr-2" />
                            Re-record
                        </button>
                        <button
                            onClick={useRecording}
                            className="bg-green-500 text-white px-4 py-2 rounded-full flex items-center"
                        >
                            <FaCheck className="mr-2" />
                            Use this video
                        </button>
                    </div>
                )}
                <div className="w-16 h-16">
                    <CircularProgressbar
                        value={timeLeft}
                        maxValue={MAX_RECORDING_TIME}
                        text={`${timeLeft}s`}
                        styles={buildStyles({
                            textColor: "#333",
                            pathColor: timeLeft > 30 ? "#22c55e" : "#ef4444",
                            trailColor: '#E5E7EB'
                        })}
                    />
                </div>
            </div>
            {error && (
                <div className="mt-4 p-2 bg-red-100 text-red-700 rounded">
                    <p>{error}</p>
                </div>
            )}
        </div>
    );
};

export default VideoRecorder;