module.exports = {
  version: 8,
  up: (db) => {
    const addArmorTypeColumn = `
      ALTER TABLE participants ADD COLUMN terraRPArmorType TEXT;
    `;
    
    db.exec(addArmorTypeColumn);
    console.log("Column 'terraRPArmorType' added to participants table.");
  }
};