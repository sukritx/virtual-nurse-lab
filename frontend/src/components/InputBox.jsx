export const InputBox = ({ onChange, placeholder, label, type = "text", name, value, error }) => {
  return (
    <div className="mb-4">
      <label className="block text-gray-700 text-sm font-bold mb-2">
        {label}
      </label>
      <input
        type={type}
        onChange={onChange}
        placeholder={placeholder}
        name={name}
        value={value}
        className={`w-full px-3 py-2 border-2 ${error ? 'border-red-500' : 'border-gray-300'} rounded focus:outline-none focus:border-purple-500 focus:border-3 transition duration-400 ease-in-out`}
      />
      {error && <p className="text-red-500 text-xs italic mt-1">{error}</p>}
    </div>
  );
};
