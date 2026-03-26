/**
 * 配置文件 ———— 用于所有的配置和文件读写
 * 
 */
import path from 'path'
import fs from 'fs'
import YAML from 'yaml'
import MD5 from 'md5'
import { promisify } from 'util'
import { pipeline } from 'stream'
import { getWikiData } from '../api/wiki/data.js'
import { getNotice } from '../api/wiki/page.js'
import utils from '#utils'



class User {
  constructor() {
    
  }
  
}

export default new User()
