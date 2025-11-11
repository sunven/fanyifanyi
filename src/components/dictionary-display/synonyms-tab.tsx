interface SynonymsTabProps {

  data: any[];
}

const SynonymsTab = ({ data }: SynonymsTabProps) => {



  return (
    <div className="space-y-2">
      {data?.map((item, index) => {
        const pos = item.syno.pos;
        const translation = item.syno.tran;
        const words = item.syno.ws;

        return (
          <div key={index} className={`bg-gradient-to-r from-gray-50 to-indigo-50 p-2 rounded-md`}>
            <h4 className="font-semibold text-gray-700 mb-2 flex gap-2 items-center">
              <span className="text-blue-500">{pos}</span>
              {translation}
            </h4>
            <div className="flex flex-wrap gap-2">
              {words.map((wordObj: any, wordIndex: number) => (
                <span
                  key={wordIndex}
                  className={`p-2 rounded-md text-xs font-medium bg-gray-100 text-gray-800`}
                >
                  {wordObj.w}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SynonymsTab;